import { createServerFn } from "@tanstack/react-start";

/**
 * Persistent, resumable logbook backfill.
 *
 * State lives in two Postgres tables:
 *   - public.backfill_progress  (one row per pilot username)
 *   - public.simfly_flights     (one row per (username, flight_id))
 *
 * The UI calls `tickBackfill` repeatedly while status === "running".
 * Each tick:
 *   1. reads the persisted row
 *   2. fetches the next N pages (concurrency 6)
 *   3. upserts new flights, advances current_page
 *   4. flips status → "completed" when current_page >= total_pages
 *
 * Because every advance is persisted, refresh / reconnect / worker eviction
 * simply resumes from the next page on the next tick.
 */

const SIMFLY_BASE = "https://simfly.io/api";
const DEFAULT_USERNAME = "shill";
const DEFAULT_NONCE = "1697880083";
const FETCH_TIMEOUT_MS = 12_000;

// Per-tick work budget. 20 pages @ ~250ms / 6 in parallel ≈ 1s of server time.
const PAGES_PER_TICK = 20;
const TICK_CONCURRENCY = 6;
const MAX_PAGES_CAP = 5000;
const UPSERT_CHUNK_SIZE = 100;

type RawFlightLite = {
  id: string;
  aircraft: string;
  aircraft_icao: string;
  aircraftId: string;
  aircraft_tailNumber?: string;
  departure_icao: string;
  destination_icao: string;
  mission_start_ts: string;
  landing_rate?: number;
  total_distance: number;
  flight_time: string;
  total_reward: number;
  pax: number;
  xp: number;
  licence?: string;
  licence_rank?: number;
  licence_rankName?: string;
  origin?: { name: string; icao: string };
  destination?: { name: string; icao: string };
};

type RawFlightsPage = {
  page: number;
  totalPages: number;
  totalFlights: number;
  items: number;
  flights: RawFlightLite[];
};

export type BackfillStatusRow = {
  username: string;
  status: "idle" | "running" | "completed" | "failed" | "stalled";
  total_pages: number;
  current_page: number;
  flights_imported: number;
  flights_total_est: number;
  error_message: string | null;
  started_at: string | null;
  last_page_at: string | null;
  updated_at: string;
  /** Computed server-side: seconds since last_page_at when status === "running". Not persisted. */
  seconds_since_progress?: number;
  /** Computed: the page number the importer will try next. Not persisted. */
  next_page?: number;
};

const STALL_THRESHOLD_SEC = 60;

function logImport(username: string, msg: string, extra?: Record<string, unknown>) {
  const tag = `[backfill:${username}]`;
  if (extra && Object.keys(extra).length > 0) {
    console.log(`${tag} ${msg}`, extra);
  } else {
    console.log(`${tag} ${msg}`);
  }
}

/**
 * Strip computed-only fields before persisting. Supabase's typed upsert
 * rejects properties that don't exist as table columns.
 */
function persistable(row: BackfillStatusRow): Omit<BackfillStatusRow, "seconds_since_progress" | "next_page"> {
  const { seconds_since_progress: _s, next_page: _n, ...rest } = row;
  void _s;
  void _n;
  return rest;
}

/** Decorate a freshly-read row with computed UI fields (stall info, next page). */
function decorate(row: BackfillStatusRow): BackfillStatusRow {
  const next_page = row.current_page + 1;
  let seconds_since_progress: number | undefined;
  let status: BackfillStatusRow["status"] = row.status;
  let error_message: string | null = row.error_message;
  if (row.status === "running" && row.last_page_at) {
    const elapsed = Math.floor((Date.now() - new Date(row.last_page_at).getTime()) / 1000);
    seconds_since_progress = elapsed;
    if (elapsed > STALL_THRESHOLD_SEC) {
      status = "stalled";
      error_message =
        error_message ??
        `No progress for ${elapsed}s. Last completed page: ${row.current_page}. Currently attempting page ${next_page}.`;
    }
  }
  return { ...row, status, error_message, seconds_since_progress, next_page };
}

function sanitiseNonce(raw?: string | null): string {
  if (!raw) return "";
  return /^\d+$/.test(raw) ? raw : "";
}

function sanitiseUsername(raw?: string | null): string {
  const v = (raw ?? "").trim();
  // SimFly usernames are alphanumeric + - _; reject anything else.
  return /^[A-Za-z0-9_.-]{1,40}$/.test(v) ? v : "";
}

async function fetchJSON<T>(url: string): Promise<T | null> {
  const ctl = new AbortController();
  const timeout = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: ctl.signal,
    });
    if (!res.ok) return null;
    const text = await res.text();
    try {
      const parsed = JSON.parse(text) as unknown;
      // SimFly returns 200 OK with a JSON error envelope on overload
      // (e.g. {code: 1040, message: "Too many connections"}). Treat as transient.
      if (
        parsed &&
        typeof parsed === "object" &&
        "code" in parsed &&
        "message" in parsed &&
        !("success" in parsed) &&
        !("flights" in parsed) &&
        !("page" in parsed)
      ) {
        return null;
      }
      return parsed as T;
    } catch {
      // Plaintext error body like "Error.BrainServer.ConnectionRefused".
      return null;
    }
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJSONWithRetry<T>(url: string, attempts = 4): Promise<T | null> {
  for (let i = 0; i < attempts; i++) {
    const res = await fetchJSON<T>(url);
    if (res) return res;
    if (i < attempts - 1) {
      await new Promise((r) => setTimeout(r, 250 * (i + 1)));
    }
  }
  return null;
}

async function fetchPages<T>(urls: string[], concurrency: number): Promise<(T | null)[]> {
  const out: (T | null)[] = new Array(urls.length).fill(null);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, urls.length) }, async () => {
      while (next < urls.length) {
        const idx = next++;
        out[idx] = (await fetchJSON<T>(urls[idx])) ?? (await fetchJSON<T>(urls[idx]));
      }
    }),
  );
  return out;
}

function emptyRow(username: string): BackfillStatusRow {
  return {
    username,
    status: "idle",
    total_pages: 0,
    current_page: 0,
    flights_imported: 0,
    flights_total_est: 0,
    error_message: null,
    started_at: null,
    last_page_at: null,
    updated_at: new Date().toISOString(),
  };
}

type SupabaseLike = {
  from: (table: string) => {
    select: (columns?: string, options?: { count?: "exact"; head?: boolean }) => {
      eq: (column: string, value: string) => PromiseLike<{ count: number | null; error: { message?: string } | null }>;
    };
    upsert: (
      values: unknown,
      options?: { onConflict?: string; ignoreDuplicates?: boolean },
    ) => PromiseLike<{ error: { message?: string } | null }>;
  };
};

async function countCachedFlights(supabaseAdmin: SupabaseLike, username: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("simfly_flights")
    .select("flight_id", { count: "exact", head: true })
    .eq("username", username);
  if (error) throw new Error(error.message ?? "Unable to count imported flights.");
  return count ?? 0;
}

function expectedComplete(row: BackfillStatusRow): number {
  return Math.max(0, row.flights_total_est || row.flights_imported || 0);
}

async function repairIfPrematurelyCompleted(
  supabaseAdmin: SupabaseLike,
  row: BackfillStatusRow,
): Promise<BackfillStatusRow> {
  const expected = expectedComplete(row);
  if (row.status !== "completed" || expected <= 0) return row;
  const actual = await countCachedFlights(supabaseAdmin, row.username);
  // SimFly totals can drift by a couple of records while a user is flying, but
  // a "completed" row with only page-1 data is invalid and must be re-run.
  if (actual >= Math.max(0, expected - 2)) return row;
  const repaired: BackfillStatusRow = {
    ...row,
    status: "running",
    current_page: 0,
    flights_imported: actual,
    error_message: `Import restarted: only ${actual} of ~${expected} cached flights were found after a completed run.`,
    last_page_at: null,
    started_at: row.started_at ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabaseAdmin.from("backfill_progress").upsert(persistable(repaired));
  if (error) throw new Error(error.message ?? "Unable to repair backfill progress.");
  return repaired;
}

async function upsertFlightRows(
  supabaseAdmin: SupabaseLike,
  rows: Record<string, unknown>[],
): Promise<void> {
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK_SIZE);
    const { error } = await supabaseAdmin.from("simfly_flights").upsert(chunk, {
      onConflict: "username,flight_id",
      ignoreDuplicates: true,
    });
    if (error) throw new Error(error.message ?? "Unable to import flight rows.");
  }
}

async function upsertProgress(
  supabaseAdmin: SupabaseLike,
  row: BackfillStatusRow,
): Promise<void> {
  const { error } = await supabaseAdmin.from("backfill_progress").upsert(persistable(row));
  if (error) throw new Error(error.message ?? "Unable to update backfill progress.");
}

function flightToRow(username: string, f: RawFlightLite): Record<string, unknown> {
  return {
    username,
    flight_id: f.id,
    mission_start_ts: f.mission_start_ts || null,
    aircraft: f.aircraft ?? null,
    aircraft_icao: f.aircraft_icao ?? null,
    aircraft_id: f.aircraftId ?? null,
    aircraft_tail_number: f.aircraft_tailNumber ?? null,
    departure_icao: f.departure_icao ?? null,
    destination_icao: f.destination_icao ?? null,
    landing_rate: f.landing_rate ?? null,
    total_distance: f.total_distance ?? null,
    flight_time: f.flight_time ?? null,
    total_reward: f.total_reward ?? null,
    pax: f.pax ?? null,
    xp: f.xp ?? null,
    licence: f.licence ?? null,
    licence_rank: f.licence_rank ?? null,
    licence_rank_name: f.licence_rankName ?? null,
    origin_name: f.origin?.name ?? null,
    destination_name: f.destination?.name ?? null,
    raw: JSON.parse(JSON.stringify(f)),
  };
}

export function rowToRawFlight(r: Record<string, unknown>): RawFlightLite {
  const raw = (r.raw ?? {}) as Partial<RawFlightLite>;
  return {
    id: (r.flight_id as string) ?? raw.id ?? "",
    aircraft: (r.aircraft as string) ?? raw.aircraft ?? "",
    aircraft_icao: (r.aircraft_icao as string) ?? raw.aircraft_icao ?? "",
    aircraftId: (r.aircraft_id as string) ?? raw.aircraftId ?? "",
    aircraft_tailNumber: (r.aircraft_tail_number as string) ?? raw.aircraft_tailNumber,
    departure_icao: (r.departure_icao as string) ?? raw.departure_icao ?? "",
    destination_icao: (r.destination_icao as string) ?? raw.destination_icao ?? "",
    mission_start_ts: (r.mission_start_ts as string) ?? raw.mission_start_ts ?? "",
    landing_rate: Number(r.landing_rate ?? raw.landing_rate ?? 0) || undefined,
    total_distance: Number(r.total_distance ?? raw.total_distance ?? 0) || 0,
    flight_time: (r.flight_time as string) ?? raw.flight_time ?? "",
    total_reward: Number(r.total_reward ?? raw.total_reward ?? 0) || 0,
    pax: Number(r.pax ?? raw.pax ?? 0) || 0,
    xp: Number(r.xp ?? raw.xp ?? 0) || 0,
    licence: (r.licence as string) ?? raw.licence,
    licence_rank: (r.licence_rank as number) ?? raw.licence_rank,
    licence_rankName: (r.licence_rank_name as string) ?? raw.licence_rankName,
    origin: raw.origin,
    destination: raw.destination,
  };
}

export const getBackfillStatus = createServerFn({ method: "GET" })
  .inputValidator((d?: { username?: string }) => d ?? {})
  .handler(async ({ data }): Promise<BackfillStatusRow> => {
    const username = sanitiseUsername(data?.username) || DEFAULT_USERNAME;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as SupabaseLike;
    const { data: row } = await supabaseAdmin
      .from("backfill_progress")
      .select("*")
      .eq("username", username)
      .maybeSingle();
    const current = (row as BackfillStatusRow | null) ?? emptyRow(username);
    const repaired = await repairIfPrematurelyCompleted(db, current);
    return decorate(repaired);
  });

export const getFlightsForUser = createServerFn({ method: "GET" })
  .inputValidator((d?: { username?: string }) => d ?? {})
  .handler(async ({ data }): Promise<RawFlightLite[]> => {
    const username = sanitiseUsername(data?.username) || DEFAULT_USERNAME;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Cap defensively. Most pilots have far fewer than this.
    const { data: rows } = await supabaseAdmin
      .from("simfly_flights")
      .select("*")
      .eq("username", username)
      .order("mission_start_ts", { ascending: false })
      .limit(50000);
    return ((rows ?? []) as Record<string, unknown>[]).map(rowToRawFlight);
  });

async function discoverTotalPages(username: string, nonce: string): Promise<{
  totalPages: number;
  totalFlights: number;
  firstPage: RawFlightsPage | null;
}> {
  const qs = `username=${encodeURIComponent(username)}&nonce=${encodeURIComponent(nonce)}`;
  const p1 = await fetchJSONWithRetry<RawFlightsPage>(`${SIMFLY_BASE}/user/flights?${qs}&fpage=1`, 5);
  if (!p1) return { totalPages: 0, totalFlights: 0, firstPage: null };
  return {
    totalPages: Math.max(1, Math.min(MAX_PAGES_CAP, Number(p1.totalPages) || 1)),
    totalFlights: Number(p1.totalFlights) || 0,
    firstPage: p1,
  };
}

/**
 * Resolve a pilot's per-user `nonce` (the numeric id baked into every public
 * `/logbook/<username>/<nonce>` URL on SimFly). The Sky Ranking endpoint
 * indexes every public pilot and returns `usernonce` for an exact `uname`
 * match — works regardless of whether the pilot is currently airborne.
 */
type NonceCacheDb = {
  from: (table: string) => {
    select: (columns?: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => PromiseLike<{ data: { nonce?: string } | null; error: unknown }>;
      };
    };
    upsert: (values: unknown, options?: { onConflict?: string }) => PromiseLike<{ error: unknown }>;
  };
};

async function lookupNonceFromSkyRank(username: string): Promise<string | null> {
  const periods = ["all", "month", "week", "day"] as const;
  for (const period of periods) {
    const url = `${SIMFLY_BASE}/game/sky-rank?period=${period}&res=16&uname=${encodeURIComponent(username)}`;
    const data = await fetchJSONWithRetry<{
      success?: boolean;
      content?: { ranks?: { username?: string; usernonce?: number }[] };
    }>(url, 4);
    const hit = (data?.content?.ranks ?? []).find(
      (r) => (r.username ?? "").toLowerCase() === username.toLowerCase(),
    );
    const n = hit?.usernonce;
    if (typeof n === "number" && Number.isFinite(n) && n > 0) return String(n);
  }
  return null;
}

async function resolvePilotNonce(username: string): Promise<string | null> {
  if (username.toLowerCase() === DEFAULT_USERNAME.toLowerCase()) return DEFAULT_NONCE;

  // Check cache first to avoid hammering the Sky Ranking endpoint.
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as NonceCacheDb;
    const { data: cached } = await db
      .from("pilot_nonces")
      .select("nonce")
      .eq("username", username)
      .maybeSingle();
    const cachedNonce = sanitiseNonce(cached?.nonce);
    if (cachedNonce) return cachedNonce;
  } catch {
    // Cache miss / read failure — fall through to live lookup.
  }

  const resolved = await lookupNonceFromSkyRank(username);
  if (!resolved) return null;

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as NonceCacheDb;
    await db.from("pilot_nonces").upsert(
      { username, nonce: resolved, resolved_at: new Date().toISOString() },
      { onConflict: "username" },
    );
  } catch {
    // Persisting the cache is best-effort; the resolved nonce is still valid.
  }
  return resolved;
}

export const tickBackfill = createServerFn({ method: "POST" })
  .inputValidator((d?: { username?: string; nonce?: string }) => d ?? {})
  .handler(async ({ data }): Promise<BackfillStatusRow> => {
    const username = sanitiseUsername(data?.username) || DEFAULT_USERNAME;
    const suppliedNonce = sanitiseNonce(data?.nonce);
    const nonce =
      suppliedNonce ||
      (username.toLowerCase() === DEFAULT_USERNAME.toLowerCase()
        ? DEFAULT_NONCE
        : (await resolvePilotNonce(username)) || "");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as SupabaseLike;

    const { data: existing } = await supabaseAdmin
      .from("backfill_progress")
      .select("*")
      .eq("username", username)
      .maybeSingle();

    let row = (existing as BackfillStatusRow | null) ?? null;

    if (!nonce) {
      const failed: BackfillStatusRow = {
        ...(row ?? emptyRow(username)),
        username,
        status: "failed",
        error_message: `Could not resolve a public logbook for @${username}. The SimFly Sky Ranking has no entry for this pilot — check the username spelling.`,
        updated_at: new Date().toISOString(),
      };
      await upsertProgress(db, failed);
      return failed;
    }

    // First tick (or row missing) — discover totals.
    if (!row || row.total_pages <= 0) {
      const disc = await discoverTotalPages(username, nonce);
      if (disc.totalPages <= 0) {
        const failed: BackfillStatusRow = {
          ...emptyRow(username),
          status: "failed",
          error_message: `Unable to reach SimFly logbook for @${username} (resolved nonce ${nonce}). The pilot may have no public flights yet.`,
        };
        await upsertProgress(db, failed);
        return failed;
      }

      // Persist page 1 immediately.
      if (disc.firstPage?.flights?.length) {
        await upsertFlightRows(
          db,
          disc.firstPage.flights.map((f) => flightToRow(username, f)),
        );
      }

      const cachedCount = await countCachedFlights(db, username);

      row = {
        username,
        status: "running",
        total_pages: disc.totalPages,
        current_page: 1,
        flights_imported: cachedCount,
        flights_total_est: disc.totalFlights,
        error_message: null,
        started_at: new Date().toISOString(),
        last_page_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await upsertProgress(db, row);
      return row;
    }

    row = await repairIfPrematurelyCompleted(db, row);

    // Already done — no-op (graphs auto-refresh page 1 separately via getSimflyPayload).
    if (row.current_page >= row.total_pages) {
      if (row.status !== "completed") {
        const actual = await countCachedFlights(db, username);
        const expected = expectedComplete(row);
        if (expected > 0 && actual < Math.max(0, expected - 2)) {
          const repaired: BackfillStatusRow = {
            ...row,
            status: "running",
            current_page: 0,
            flights_imported: actual,
            error_message: `Import restarted: only ${actual} of ~${expected} cached flights were found before completion.`,
            last_page_at: null,
            updated_at: new Date().toISOString(),
          };
          await upsertProgress(db, repaired);
          return repaired;
        }
        const completed = {
          ...row,
          status: "completed" as const,
          flights_imported: actual,
          error_message: null,
          updated_at: new Date().toISOString(),
        };
        await upsertProgress(db, completed);
        return completed;
      }
      return row;
    }

    // Fetch the next batch of older pages.
    const startPage = row.current_page + 1;
    const endPage = Math.min(row.total_pages, startPage + PAGES_PER_TICK - 1);
    const qs = `username=${encodeURIComponent(username)}&nonce=${encodeURIComponent(nonce)}`;

    logImport(username, `Tick start — pages ${startPage}..${endPage} of ${row.total_pages}`, {
      current_page: row.current_page,
      flights_imported: row.flights_imported,
    });

    // Per-page fetch with detailed logging. We still parallelise via a
    // concurrency-bounded pool, but log start/download/parse/process for each.
    type PageOutcome =
      | { ok: true; page: number; data: RawFlightsPage }
      | { ok: false; page: number; reason: string; elapsedMs: number; missionId?: string };

    const outcomes: PageOutcome[] = [];
    let pageCursor = 0;
    const pageNumbers = Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i);

    async function processOnePage(pageNum: number): Promise<PageOutcome> {
      const url = `${SIMFLY_BASE}/user/flights?${qs}&fpage=${pageNum}`;
      const t0 = Date.now();
      logImport(username, `Starting page ${pageNum}`);
      logImport(username, `Downloading page ${pageNum}...`);
      try {
        const data = await fetchJSONWithRetry<RawFlightsPage>(url, 5);
        if (!data || !Array.isArray(data.flights)) {
          const elapsedMs = Date.now() - t0;
          logImport(username, `Page ${pageNum} FAILED to download after ${elapsedMs}ms`);
          return { ok: false, page: pageNum, reason: "fetch-failed-or-empty", elapsedMs };
        }
        logImport(username, `Downloaded page ${pageNum} successfully (${Date.now() - t0}ms)`);
        logImport(username, `Found ${data.flights.length} flights on page ${pageNum}`);
        for (let i = 0; i < data.flights.length; i++) {
          const f = data.flights[i];
          logImport(
            username,
            `Processing flight ${i + 1}/${data.flights.length} on page ${pageNum} (id=${f.id})`,
          );
        }
        return { ok: true, page: pageNum, data };
      } catch (err) {
        const elapsedMs = Date.now() - t0;
        const stack = err instanceof Error ? err.stack : String(err);
        console.error(
          `[backfill:${username}] EXCEPTION on page ${pageNum} after ${elapsedMs}ms during fetch/parse`,
          { stack, url },
        );
        return {
          ok: false,
          page: pageNum,
          reason: err instanceof Error ? err.message : String(err),
          elapsedMs,
        };
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(TICK_CONCURRENCY, pageNumbers.length) }, async () => {
        while (pageCursor < pageNumbers.length) {
          const idx = pageCursor++;
          const r = await processOnePage(pageNumbers[idx]);
          outcomes.push(r);
        }
      }),
    );

    outcomes.sort((a, b) => a.page - b.page);
    const firstFailure = outcomes.find((o) => !o.ok) as Extract<PageOutcome, { ok: false }> | undefined;
    if (firstFailure) {
      logImport(username, `Page ${firstFailure.page} failed — not advancing progress`, {
        reason: firstFailure.reason,
        elapsedMs: firstFailure.elapsedMs,
      });
      const retrying: BackfillStatusRow = {
        ...row,
        status: "running",
        error_message: `Page ${firstFailure.page} failed (${firstFailure.reason}) after ${firstFailure.elapsedMs}ms; retrying on next tick.`,
        updated_at: new Date().toISOString(),
      };
      await upsertProgress(db, retrying);
      return decorate(retrying);
    }

    const rowsToInsert: Record<string, unknown>[] = [];
    for (const o of outcomes) {
      if (!o.ok) continue;
      for (const f of o.data.flights) rowsToInsert.push(flightToRow(username, f));
    }

    if (rowsToInsert.length) {
      logImport(username, `Writing ${rowsToInsert.length} flight rows for pages ${startPage}..${endPage} to database`);
      const tDb = Date.now();
      try {
        await upsertFlightRows(db, rowsToInsert);
      } catch (err) {
        const stack = err instanceof Error ? err.stack : String(err);
        console.error(
          `[backfill:${username}] EXCEPTION writing pages ${startPage}..${endPage} to DB after ${Date.now() - tDb}ms`,
          { stack, operation: "upsert simfly_flights", rowCount: rowsToInsert.length },
        );
        const failed: BackfillStatusRow = {
          ...row,
          status: "failed",
          error_message: `DB write failed for pages ${startPage}..${endPage}: ${err instanceof Error ? err.message : String(err)}`,
          updated_at: new Date().toISOString(),
        };
        await upsertProgress(db, failed);
        return decorate(failed);
      }
      logImport(username, `DB write OK (${Date.now() - tDb}ms)`);
    }

    for (const o of outcomes) {
      if (o.ok) logImport(username, `Page ${o.page} completed`);
    }

    const newImported = await countCachedFlights(db, username);
    const advanced = endPage;
    const done = advanced >= row.total_pages;
    const expected = expectedComplete({ ...row, flights_total_est: row.flights_total_est });
    const next: BackfillStatusRow = {
      ...row,
      status: done && (expected <= 0 || newImported >= Math.max(0, expected - 2)) ? "completed" : "running",
      current_page: advanced,
      flights_imported: newImported,
      error_message:
        done && expected > 0 && newImported < Math.max(0, expected - 2)
          ? `Final verification found only ${newImported} of ~${expected} cached flights; continuing import instead of marking complete.`
          : null,
      last_page_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    if (done && next.status === "running") {
      next.current_page = 0;
      next.last_page_at = null;
    }
    logImport(username, `Tick end — advanced to page ${advanced}${done ? " (done)" : `, moving to page ${advanced + 1}`}`, {
      imported: newImported,
      status: next.status,
    });
    await upsertProgress(db, next);
    return decorate(next);
  });
  });

/**
 * Manual reset — wipes flights + progress for the username so the next tick
 * starts from page 1. Used by the consistency page "Force re-import" button.
 */
export const resetBackfill = createServerFn({ method: "POST" })
  .inputValidator((d?: { username?: string }) => d ?? {})
  .handler(async ({ data }): Promise<BackfillStatusRow> => {
    const username = sanitiseUsername(data?.username) || DEFAULT_USERNAME;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as SupabaseLike;
    await supabaseAdmin.from("simfly_flights").delete().eq("username", username);
    const fresh = emptyRow(username);
    await upsertProgress(db, fresh);
    return fresh;
  });

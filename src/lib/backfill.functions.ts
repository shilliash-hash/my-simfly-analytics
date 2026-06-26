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
  status: "idle" | "running" | "completed" | "failed";
  total_pages: number;
  current_page: number;
  flights_imported: number;
  flights_total_est: number;
  error_message: string | null;
  started_at: string | null;
  last_page_at: string | null;
  updated_at: string;
};

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
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
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
      eq: (column: string, value: string) => Promise<{ count: number | null; error: { message?: string } | null }>;
    };
    upsert: (
      values: unknown,
      options?: { onConflict?: string; ignoreDuplicates?: boolean },
    ) => Promise<{ error: { message?: string } | null }>;
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
  const { error } = await supabaseAdmin.from("backfill_progress").upsert(repaired);
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
  const { error } = await supabaseAdmin.from("backfill_progress").upsert(row);
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
    const { data: row } = await supabaseAdmin
      .from("backfill_progress")
      .select("*")
      .eq("username", username)
      .maybeSingle();
    const current = (row as BackfillStatusRow | null) ?? emptyRow(username);
    return repairIfPrematurelyCompleted(supabaseAdmin, current);
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
  const p1 = await fetchJSON<RawFlightsPage>(`${SIMFLY_BASE}/user/flights?${qs}&page=1`);
  if (!p1) return { totalPages: 0, totalFlights: 0, firstPage: null };
  return {
    totalPages: Math.max(1, Math.min(MAX_PAGES_CAP, Number(p1.totalPages) || 1)),
    totalFlights: Number(p1.totalFlights) || 0,
    firstPage: p1,
  };
}

export const tickBackfill = createServerFn({ method: "POST" })
  .inputValidator((d?: { username?: string; nonce?: string }) => d ?? {})
  .handler(async ({ data }): Promise<BackfillStatusRow> => {
    const username = sanitiseUsername(data?.username) || DEFAULT_USERNAME;
    const nonce =
      sanitiseNonce(data?.nonce) ||
      (username === DEFAULT_USERNAME ? DEFAULT_NONCE : DEFAULT_NONCE);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: existing } = await supabaseAdmin
      .from("backfill_progress")
      .select("*")
      .eq("username", username)
      .maybeSingle();

    let row = (existing as BackfillStatusRow | null) ?? null;

    // First tick (or row missing) — discover totals.
    if (!row || row.total_pages <= 0) {
      const disc = await discoverTotalPages(username, nonce);
      if (disc.totalPages <= 0) {
        const failed: BackfillStatusRow = {
          ...emptyRow(username),
          status: "failed",
          error_message: "Unable to reach SimFly logbook (page 1).",
        };
        await upsertProgress(supabaseAdmin, failed);
        return failed;
      }

      // Persist page 1 immediately.
      if (disc.firstPage?.flights?.length) {
        await upsertFlightRows(
          supabaseAdmin,
          disc.firstPage.flights.map((f) => flightToRow(username, f)),
        );
      }

      const cachedCount = await countCachedFlights(supabaseAdmin, username);

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
      await upsertProgress(supabaseAdmin, row);
      return row;
    }

    row = await repairIfPrematurelyCompleted(supabaseAdmin, row);

    // Already done — no-op (graphs auto-refresh page 1 separately via getSimflyPayload).
    if (row.current_page >= row.total_pages) {
      if (row.status !== "completed") {
        const actual = await countCachedFlights(supabaseAdmin, username);
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
          await upsertProgress(supabaseAdmin, repaired);
          return repaired;
        }
        const completed = {
          ...row,
          status: "completed" as const,
          flights_imported: actual,
          error_message: null,
          updated_at: new Date().toISOString(),
        };
        await upsertProgress(supabaseAdmin, completed);
        return completed;
      }
      return row;
    }

    // Fetch the next batch of older pages.
    const startPage = row.current_page + 1;
    const endPage = Math.min(row.total_pages, startPage + PAGES_PER_TICK - 1);
    const qs = `username=${encodeURIComponent(username)}&nonce=${encodeURIComponent(nonce)}`;
    const urls = Array.from(
      { length: endPage - startPage + 1 },
      (_, i) => `${SIMFLY_BASE}/user/flights?${qs}&page=${startPage + i}`,
    );

    let pages: (RawFlightsPage | null)[] = [];
    try {
      pages = await fetchPages<RawFlightsPage>(urls, TICK_CONCURRENCY);
    } catch (err) {
      const failed = {
        ...row,
        status: "failed" as const,
        error_message: err instanceof Error ? err.message : String(err),
        updated_at: new Date().toISOString(),
      };
      await upsertProgress(supabaseAdmin, failed);
      return failed;
    }

    const failedPage = pages.findIndex((p) => !p || !Array.isArray(p.flights));
    if (failedPage >= 0) {
      const retrying: BackfillStatusRow = {
        ...row,
        status: "running",
        error_message: `Temporary SimFly fetch failure around page ${startPage + failedPage}; retrying without advancing progress.`,
        updated_at: new Date().toISOString(),
      };
      await upsertProgress(supabaseAdmin, retrying);
      return retrying;
    }

    const rowsToInsert = pages
      .flatMap((p) => p?.flights ?? [])
      .map((f) => flightToRow(username, f));

    if (rowsToInsert.length) {
      await upsertFlightRows(supabaseAdmin, rowsToInsert);
    }

    const newImported = await countCachedFlights(supabaseAdmin, username);
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
    await upsertProgress(supabaseAdmin, next);
    return next;
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
    await supabaseAdmin.from("simfly_flights").delete().eq("username", username);
    const fresh = emptyRow(username);
    await upsertProgress(supabaseAdmin, fresh);
    return fresh;
  });

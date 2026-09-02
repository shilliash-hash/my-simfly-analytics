/**
 * System Airports Analyzer — server-only research engine.
 *
 * Read-only over existing Hub data:
 *   - community_traffic_observation  → observed activity per airport
 *   - airport_identity_cache         → ownership / tier / level (via the
 *                                      shared identity resolver)
 *   - airport_spy_record             → whether the airport was analyzed
 *
 * Nothing here is scheduled. A tier scan is a manual, bounded, resumable job
 * that only resolves airport *identity*; historical flight walking stays in
 * Airport Spy and is only triggered for a single airport at a time.
 */

import type { SystemAirportRow, SystemAirportWatchRow, SystemScanState } from "./system-airports.types";

const OBS_PAGE = 1000;
const OBS_MAX = 60_000;
/** Identity lookups performed per manual scan step. */
export const SCAN_BATCH = 40;
/** Candidate airports considered per scan (activity-ranked). */
const CANDIDATE_CAP = 600;

export function normaliseIcao(raw?: string | null): string {
  const v = (raw ?? "").trim().toUpperCase();
  return /^[A-Z0-9]{4}$/.test(v) ? v : "";
}

export function sanitiseUsername(raw?: string | null): string {
  const v = (raw ?? "").trim();
  return /^[A-Za-z0-9_.-]{1,40}$/.test(v) ? v : "";
}

export function windowCutoffMs(windowDays: number): number {
  if (!Number.isFinite(windowDays) || windowDays <= 0) return 0;
  return Date.now() - windowDays * 24 * 60 * 60_000;
}

// Tables added for this module are not in the generated types yet; keep the
// loose access contained here instead of leaking casts across the codebase.
type LooseTable = {
  select: (columns?: string) => any;
  upsert: (values: any, options?: any) => any;
  update: (values: any) => any;
  delete: () => any;
};

async function table(name: string): Promise<LooseTable> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return (supabaseAdmin as unknown as { from: (t: string) => LooseTable }).from(name);
}

// ------------------------------------------------------------- observations

type Agg = {
  icao: string;
  operations: number;
  arrivals: number;
  departures: number;
  pilots: Set<string>;
  aircraft: Set<string>;
  weeks: Map<string, number>;
  lastWeekMs: number;
};

function emptyAgg(icao: string): Agg {
  return {
    icao,
    operations: 0,
    arrivals: 0,
    departures: 0,
    pilots: new Set(),
    aircraft: new Set(),
    weeks: new Map(),
    lastWeekMs: 0,
  };
}

function bump(map: Map<string, Agg>, icao: string, kind: "arr" | "dep", row: any) {
  const code = normaliseIcao(icao);
  if (!code) return;
  let a = map.get(code);
  if (!a) {
    a = emptyAgg(code);
    map.set(code, a);
  }
  a.operations += 1;
  if (kind === "arr") a.arrivals += 1;
  else a.departures += 1;
  const pilot = (row.username as string | null)?.trim();
  if (pilot) a.pilots.add(pilot.toLowerCase());
  const ac = ((row.aircraft_name as string | null) || (row.aircraft_icao as string | null) || "")
    .trim();
  if (ac) a.aircraft.add(ac);
  const wk = row.week_start_utc as string | null;
  if (wk) {
    const ms = Date.parse(wk);
    a.weeks.set(wk, (a.weeks.get(wk) ?? 0) + 1);
    if (Number.isFinite(ms) && ms > a.lastWeekMs) a.lastWeekMs = ms;
  }
}

/** Observed activity per airport inside the analysis window. */
export async function loadActivity(windowDays: number): Promise<Map<string, Agg>> {
  const t = await table("community_traffic_observation");
  const cutoff = windowCutoffMs(windowDays);
  const map = new Map<string, Agg>();
  for (let from = 0; from < OBS_MAX; from += OBS_PAGE) {
    let q = t
      .select("origin_icao, destination_icao, username, aircraft_icao, aircraft_name, week_start_utc")
      .order("week_start_utc", { ascending: false })
      .range(from, from + OBS_PAGE - 1);
    if (cutoff > 0) q = q.gte("week_start_utc", new Date(cutoff).toISOString());
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as any[];
    for (const r of rows) {
      bump(map, r.destination_icao, "arr", r);
      bump(map, r.origin_icao, "dep", r);
    }
    if (rows.length < OBS_PAGE) break;
  }
  return map;
}

export function trendOf(weeks: Map<string, number>): "rising" | "falling" | "flat" | null {
  const ordered = [...weeks.entries()].sort((a, b) => Date.parse(a[0]) - Date.parse(b[0]));
  if (ordered.length < 4) return null;
  const half = Math.floor(ordered.length / 2);
  const first = ordered.slice(0, half).reduce((s, [, v]) => s + v, 0) / half;
  const last =
    ordered.slice(half).reduce((s, [, v]) => s + v, 0) / (ordered.length - half);
  if (first === 0 && last === 0) return "flat";
  const delta = (last - first) / Math.max(1, first);
  if (delta > 0.2) return "rising";
  if (delta < -0.2) return "falling";
  return "flat";
}

// ------------------------------------------------------------------ identity

type IdentityRow = {
  icao: string;
  name: string | null;
  owner_username: string | null;
  tier: number | null;
  level: number | null;
  asset_id: string | null;
  refresh_after: string;
};

async function readIdentityCache(icaos: string[]): Promise<Map<string, IdentityRow>> {
  const out = new Map<string, IdentityRow>();
  const t = await table("airport_identity_cache");
  for (let i = 0; i < icaos.length; i += 200) {
    const slice = icaos.slice(i, i + 200);
    const { data } = await t
      .select("icao, name, owner_username, tier, level, asset_id, refresh_after")
      .in("icao", slice);
    for (const r of (data ?? []) as IdentityRow[]) {
      out.set(String(r.icao).trim().toUpperCase(), r);
    }
  }
  return out;
}

function identityUsable(row: IdentityRow | undefined): boolean {
  if (!row) return false;
  return (
    Date.parse(row.refresh_after) > Date.now() &&
    Boolean(row.name?.trim()) &&
    row.tier !== null
  );
}

// ---------------------------------------------------------------- discovery

export type DiscoveryInput = {
  username: string;
  tiers: number[];
  windowDays: number;
};

export type DiscoveryResult = {
  rows: SystemAirportRow[];
  candidates: number;
  resolved: number;
  pending: number;
  systemOwned: number;
  playerOwned: number;
  windowDays: number;
  tiers: number[];
  scan: SystemScanState | null;
};

function rankedCandidates(activity: Map<string, Agg>): Agg[] {
  return [...activity.values()]
    .sort((a, b) => b.operations - a.operations)
    .slice(0, CANDIDATE_CAP);
}

export function scanKey(username: string, tiers: number[], windowDays: number): string {
  return `${username.toLowerCase()}|${[...tiers].sort().join(",")}|${windowDays}`;
}

export async function readScanState(key: string): Promise<SystemScanState | null> {
  const t = await table("system_airport_scan");
  const { data } = await t.select("*").eq("scan_key", key).maybeSingle();
  if (!data) return null;
  return {
    cursorIndex: (data.cursor_index as number) ?? 0,
    resolved: (data.resolved as number) ?? 0,
    total: (data.total as number) ?? 0,
    status: (data.status as string) ?? "idle",
    message: (data.message as string) ?? null,
    lastScannedAt: (data.last_scanned_at as string) ?? null,
  };
}

async function writeScanState(
  key: string,
  username: string,
  tiers: number[],
  windowDays: number,
  patch: Partial<{
    cursor_index: number;
    resolved: number;
    total: number;
    status: string;
    message: string | null;
    error_message: string | null;
    last_scanned_at: string | null;
  }>,
): Promise<string | null> {
  const t = await table("system_airport_scan");
  const { error } = await t.upsert(
    {
      scan_key: key,
      username: username.toLowerCase(),
      tiers: [...tiers].sort().join(","),
      window_days: windowDays,
      ...patch,
    },
    { onConflict: "scan_key" },
  );
  // Never silently swallow a storage failure: a schema drift here is exactly
  // what makes the scan look like it never resumes.
  if (error) {
    console.warn("[system-airports] scan state write failed", error.message);
    return error.message as string;
  }
  return null;
}


export async function buildDiscovery(input: DiscoveryInput): Promise<DiscoveryResult> {
  const activity = await loadActivity(input.windowDays);
  const candidates = rankedCandidates(activity);
  const codes = candidates.map((c) => c.icao);
  const [identity, records, watched] = await Promise.all([
    readIdentityCache(codes),
    readSpyRecords(codes),
    listWatch(input.username),
  ]);
  const watchSet = new Set(watched.map((w) => w.icao));

  const tierSet = new Set(input.tiers);
  const rows: SystemAirportRow[] = [];
  let resolved = 0;
  let systemOwned = 0;
  let playerOwned = 0;
  for (const c of candidates) {
    const id = identity.get(c.icao);
    if (identityUsable(id)) resolved += 1;
    if (!id || !identityUsable(id)) continue;
    // System-owned only. A failed metadata lookup is never treated as
    // system-owned: unusable rows are skipped above.
    if (id.owner_username && id.owner_username.trim()) {
      playerOwned += 1;
      continue;
    }
    systemOwned += 1;
    if (id.tier === null || !tierSet.has(id.tier)) continue;

    const rec = records.get(c.icao);
    rows.push({
      icao: c.icao,
      name: id.name ?? null,
      owner: null,
      tier: id.tier,
      level: id.level ?? null,
      operations: c.operations,
      arrivals: c.arrivals,
      departures: c.departures,
      uniquePilots: c.pilots.size,
      aircraftVariety: c.aircraft.size,
      weeksObserved: c.weeks.size,
      lastActivityAt: c.lastWeekMs ? new Date(c.lastWeekMs).toISOString() : null,
      trend: trendOf(c.weeks),
      analyzed: Boolean(rec) && ((rec?.operations ?? 0) > 0 || (rec?.weeks_covered ?? 0) > 0),
      lastAnalyzedAt: (rec?.last_refreshed_at as string) ?? null,
      watched: watchSet.has(c.icao),
    });
  }

  rows.sort((a, b) => b.operations - a.operations);

  return {
    rows,
    candidates: candidates.length,
    resolved,
    pending: candidates.length - resolved,
    systemOwned,
    playerOwned,
    windowDays: input.windowDays,
    tiers: input.tiers,
    scan: await readScanState(scanKey(input.username, input.tiers, input.windowDays)),
  };
}

async function readSpyRecords(icaos: string[]) {
  const out = new Map<string, any>();
  if (icaos.length === 0) return out;
  const t = await table("airport_spy_record");
  for (let i = 0; i < icaos.length; i += 200) {
    const { data } = await t
      .select("icao, operations, weeks_covered, last_refreshed_at")
      .in("icao", icaos.slice(i, i + 200));
    for (const r of (data ?? []) as any[]) out.set(String(r.icao).trim().toUpperCase(), r);
  }
  return out;
}

// --------------------------------------------------------------- tier scan

export type ScanStep = {
  resolved: number;
  pending: number;
  total: number;
  done: boolean;
  message: string;
};

/** Batches resolved back to back inside a single scan run. */
const MAX_BATCHES_PER_RUN = 6;
/** Wall-clock budget for one scan run. */
const RUN_BUDGET_MS = 45_000;

/**
 * One bounded scan run: resolves identity for pending candidate airports in
 * batches through the shared resolver (cache first, SimFly only when a row is
 * missing or expired), persisting the cursor after every batch so the next run
 * resumes where this one stopped. Never walks flight history.
 */
export async function runScanStep(input: DiscoveryInput): Promise<ScanStep> {
  const key = scanKey(input.username, input.tiers, input.windowDays);
  const activity = await loadActivity(input.windowDays);
  const candidates = rankedCandidates(activity);
  const codes = candidates.map((c) => c.icao);
  const identity = await readIdentityCache(codes);
  let pendingCodes = codes.filter((c) => !identityUsable(identity.get(c)));

  const total = codes.length;
  let storageError: string | null = null;

  if (pendingCodes.length === 0) {
    storageError = await writeScanState(key, input.username, input.tiers, input.windowDays, {
      cursor_index: total,
      resolved: total,
      total,
      status: "complete",
      message: "All candidate airports classified.",
      error_message: null,
      last_scanned_at: new Date().toISOString(),
    });
    return {
      resolved: total,
      pending: 0,
      total,
      done: true,
      message: storageError
        ? `Scan complete, but progress could not be saved: ${storageError}`
        : `Scan complete · ${total} of ${total} candidate airports classified.`,
    };
  }

  storageError = await writeScanState(key, input.username, input.tiers, input.windowDays, {
    total,
    status: "running",
    message: `Classifying ${Math.min(SCAN_BATCH, pendingCodes.length)} of ${pendingCodes.length} pending airports…`,
    error_message: null,
  });

  const { resolveAirportIdentityFull } = await import("./airport-identity.server");
  const startedAt = Date.now();
  let resolvedThisRun = 0;
  let batches = 0;

  while (
    pendingCodes.length > 0 &&
    batches < MAX_BATCHES_PER_RUN &&
    Date.now() - startedAt < RUN_BUDGET_MS
  ) {
    const slice = pendingCodes.slice(0, SCAN_BATCH);
    const stillPending: string[] = [];
    for (const icao of slice) {
      try {
        const result = await resolveAirportIdentityFull(icao, { force: true });
        if (result.name && result.tier !== null) resolvedThisRun += 1;
        else stillPending.push(icao);
      } catch {
        // A failed lookup stays pending; it is never counted as system-owned.
        stillPending.push(icao);
      }
    }
    batches += 1;
    pendingCodes = [...stillPending, ...pendingCodes.slice(slice.length)];

    const resolvedSoFar = total - pendingCodes.length;
    const write = await writeScanState(key, input.username, input.tiers, input.windowDays, {
      cursor_index: resolvedSoFar,
      resolved: resolvedSoFar,
      total,
      status: pendingCodes.length > 0 ? "partial" : "complete",
      message: `${resolvedSoFar} of ${total} candidate airports classified.`,
      error_message: null,
      last_scanned_at: new Date().toISOString(),
    });
    if (write) storageError = write;
    // Nothing at all resolved in this batch — stop instead of spinning.
    if (slice.length === stillPending.length) break;
  }

  const remaining = pendingCodes.length;
  const resolvedNow = total - remaining;
  const done = remaining === 0;

  await writeScanState(key, input.username, input.tiers, input.windowDays, {
    cursor_index: resolvedNow,
    resolved: resolvedNow,
    total,
    status: done ? "complete" : "partial",
    message: done
      ? "All candidate airports classified."
      : `${resolvedNow} of ${total} candidate airports classified.`,
    error_message: storageError,
    last_scanned_at: new Date().toISOString(),
  });

  const base = done
    ? `Scan complete · ${resolvedNow} of ${total} candidate airports classified.`
    : `${resolvedNow} of ${total} classified · ${remaining} unresolved (+${resolvedThisRun} this run). Continue the scan to keep going.`;

  return {
    resolved: resolvedNow,
    pending: remaining,
    total,
    done,
    message: storageError ? `${base} Progress could not be saved: ${storageError}` : base,
  };
}


// ---------------------------------------------------------------- watchlist

export async function listWatch(username: string): Promise<SystemAirportWatchRow[]> {
  const u = sanitiseUsername(username);
  if (!u) return [];
  const t = await table("system_airport_watch");
  const { data, error } = await t
    .select("icao, notes, created_at, last_opened_at")
    .eq("username", u.toLowerCase())
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Watchlist read failed: ${error.message}`);
  const rows = (data ?? []) as any[];

  const codes = rows.map((r) => String(r.icao).trim().toUpperCase());
  if (codes.length === 0) return [];
  const [identity, records] = await Promise.all([
    readIdentityCache(codes),
    readSpyRecords(codes),
  ]);
  return rows.map((r) => {
    const icao = String(r.icao).trim().toUpperCase();
    const id = identity.get(icao);
    const rec = records.get(icao);
    return {
      icao,
      name: id?.name ?? null,
      owner: id?.owner_username ?? null,
      ownershipKnown: identityUsable(id),
      tier: id?.tier ?? null,
      level: id?.level ?? null,
      addedAt: r.created_at as string,
      lastOpenedAt: (r.last_opened_at as string) ?? null,
      lastAnalyzedAt: (rec?.last_refreshed_at as string) ?? null,
      analyzed: Boolean(rec) && ((rec?.operations ?? 0) > 0 || (rec?.weeks_covered ?? 0) > 0),
      operations: (rec?.operations as number) ?? 0,
    };
  });
}

export async function addWatch(username: string, icao: string, notes?: string) {
  const u = sanitiseUsername(username);
  const code = normaliseIcao(icao);
  if (!u || !code) throw new Error("Invalid watch entry.");
  const t = await table("system_airport_watch");
  await t.upsert(
    { username: u.toLowerCase(), icao: code, notes: notes?.trim() || null },
    { onConflict: "username,icao", ignoreDuplicates: true },
  );
  return { ok: true as const };
}

export async function removeWatch(username: string, icao: string) {
  const u = sanitiseUsername(username);
  const code = normaliseIcao(icao);
  if (!u || !code) return { ok: true as const };
  const t = await table("system_airport_watch");
  await t.delete().eq("username", u.toLowerCase()).eq("icao", code);
  return { ok: true as const };
}

export async function touchWatch(username: string, icao: string) {
  const u = sanitiseUsername(username);
  const code = normaliseIcao(icao);
  if (!u || !code) return;
  const t = await table("system_airport_watch");
  await t
    .update({ last_opened_at: new Date().toISOString() })
    .eq("username", u.toLowerCase())
    .eq("icao", code);
}

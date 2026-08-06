/**
 * Airport Spy — investigation walker and Airport Intelligence Database writer.
 *
 * Server-only. Investigations are manual and on demand: nothing here is ever
 * scheduled, and no code path crawls the SimFly ecosystem. Every walk appends
 * observations to the permanent database; records are never rebuilt.
 *
 * Evidence first: only observed values are stored. Nothing is estimated.
 */
import {
  collectAirportHistoryFlights,
  type AirportHistoryRow,
} from "./simfly.functions";

export type SpyAccessCheck = { allowed: boolean; username: string; reason?: string };

function sanitiseUsername(raw?: string | null): string {
  const v = (raw ?? "").trim();
  return /^[A-Za-z0-9_.-]{1,40}$/.test(v) ? v : "";
}

export function normaliseIcao(raw?: string | null): string {
  const v = (raw ?? "").trim().toUpperCase();
  return /^[A-Z0-9]{4}$/.test(v) ? v : "";
}

/** Monday 00:00 UTC for the given timestamp. */
export function weekStartUtc(ms: number): string {
  const d = new Date(ms);
  const s = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const daysSinceMonday = (s.getUTCDay() + 6) % 7;
  s.setUTCDate(s.getUTCDate() - daysSinceMonday);
  return s.toISOString();
}

// ---------------------------------------------------------------- access

export async function isAirportSpyPermitted(username: string): Promise<boolean> {
  const u = sanitiseUsername(username);
  if (!u) return false;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("airport_spy_access")
    .select("enabled")
    .eq("username", u.toLowerCase())
    .maybeSingle();
  return Boolean(data?.enabled);
}

export async function assertAirportSpyAccess(username: string): Promise<void> {
  if (!(await isAirportSpyPermitted(username))) {
    throw new Error("AIRPORT_SPY_ACCESS_REQUIRED");
  }
}

export async function verifyAdminToken(token: string | undefined | null): Promise<void> {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) throw new Error("ADMIN_TOKEN is not configured on the server.");
  const { createHash, timingSafeEqual } = await import("node:crypto");
  const provided = createHash("sha256").update(String(token ?? ""), "utf8").digest();
  const known = createHash("sha256").update(expected, "utf8").digest();
  if (!timingSafeEqual(provided, known)) throw new Error("Forbidden: admin token required.");
}

// ---------------------------------------------------------------- record io

export type SpyRecordRow = {
  icao: string;
  name: string | null;
  country: string | null;
  owner_username: string | null;
  tier: number | null;
  level: number | null;
  flights_analyzed: number;
  operations: number;
  arrivals: number;
  departures: number;
  unique_pilots: number;
  unique_aircraft: number;
  weeks_covered: number;
  pages_walked: number;
  oldest_flight_at: string | null;
  newest_flight_at: string | null;
  investigations: number;
  status: string;
  progress_page: number;
  progress_total: number;
  progress_message: string | null;
  error_message: string | null;
  first_observed_at: string;
  last_refreshed_at: string | null;
};

export async function readRecord(icao: string): Promise<SpyRecordRow | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("airport_spy_record")
    .select("*")
    .eq("icao", icao)
    .maybeSingle();
  return (data as SpyRecordRow | null) ?? null;
}

async function patchRecord(icao: string, patch: Record<string, unknown>) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("airport_spy_record")
    .upsert({ icao, ...patch }, { onConflict: "icao" });
}

// ---------------------------------------------------------------- walking

const PAGES_PER_CHUNK = 6;

type Aggregate = {
  flights: number;
  arrivals: number;
  departures: number;
  pilots: Map<string, {
    ops: number; arrivals: number; departures: number;
    pax: number; ownerPax: number; first: number; last: number;
  }>;
  aircraft: Set<string>;
  weeks: Map<string, {
    ops: number; arrivals: number; departures: number;
    pilots: Set<string>; aircraft: Set<string>;
    pax: number; ownerPax: number; flights: number;
  }>;
  traffic: Map<string, { flights: number; pax: number; ownerPax: number }>;
  oldest: number;
  newest: number;
};

function emptyAggregate(): Aggregate {
  return {
    flights: 0,
    arrivals: 0,
    departures: 0,
    pilots: new Map(),
    aircraft: new Set(),
    weeks: new Map(),
    traffic: new Map(),
    oldest: Number.POSITIVE_INFINITY,
    newest: 0,
  };
}

function ingest(agg: Aggregate, rows: AirportHistoryRow[]) {
  for (const r of rows) {
    if (!r.tsMs) continue;
    agg.flights += 1;
    if (r.role === "landing") agg.arrivals += 1;
    else agg.departures += 1;
    agg.oldest = Math.min(agg.oldest, r.tsMs);
    agg.newest = Math.max(agg.newest, r.tsMs);

    const pilot = (r.pilot ?? "").trim() || "—";
    const p = agg.pilots.get(pilot) ?? {
      ops: 0, arrivals: 0, departures: 0, pax: 0, ownerPax: 0,
      first: r.tsMs, last: r.tsMs,
    };
    p.ops += 1;
    if (r.role === "landing") p.arrivals += 1;
    else p.departures += 1;
    p.pax += r.basePax;
    p.ownerPax += r.ownerCredit;
    p.first = Math.min(p.first, r.tsMs);
    p.last = Math.max(p.last, r.tsMs);
    agg.pilots.set(pilot, p);

    const acLabel = r.aircraftName || "—";
    agg.aircraft.add(acLabel);

    const wk = weekStartUtc(r.tsMs);
    const w = agg.weeks.get(wk) ?? {
      ops: 0, arrivals: 0, departures: 0,
      pilots: new Set<string>(), aircraft: new Set<string>(),
      pax: 0, ownerPax: 0, flights: 0,
    };
    w.ops += 1;
    w.flights += 1;
    if (r.role === "landing") w.arrivals += 1;
    else w.departures += 1;
    w.pilots.add(pilot);
    w.aircraft.add(acLabel);
    w.pax += r.basePax;
    w.ownerPax += r.ownerCredit;
    agg.weeks.set(wk, w);

    const dims: [string, string][] = [
      ["type", acLabel],
      ["tier", String(r.aircraftTier ?? 0)],
      ["level", String(r.aircraftLevel ?? 0)],
      ["tier_level", `${r.aircraftTier ?? 0}:${r.aircraftLevel ?? 0}`],
    ];
    for (const [dimension, bucket] of dims) {
      const key = `${dimension}|${bucket}`;
      const t = agg.traffic.get(key) ?? { flights: 0, pax: 0, ownerPax: 0 };
      t.flights += 1;
      t.pax += r.basePax;
      t.ownerPax += r.ownerCredit;
      agg.traffic.set(key, t);
    }
  }
}

/** Merge a fresh aggregate into the permanent database (append-only). */
async function persist(icao: string, agg: Aggregate) {
  if (agg.flights === 0) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const nowIso = new Date().toISOString();

  // Weeks
  const weekKeys = [...agg.weeks.keys()];
  const { data: existingWeeks } = await supabaseAdmin
    .from("airport_spy_week")
    .select("*")
    .eq("icao", icao)
    .in("week_start_utc", weekKeys);
  const weekById = new Map(
    (existingWeeks ?? []).map((w) => [new Date(w.week_start_utc as string).toISOString(), w]),
  );
  const weekRows = weekKeys.map((k) => {
    const w = agg.weeks.get(k)!;
    const prev = weekById.get(k) as Record<string, number> | undefined;
    return {
      icao,
      week_start_utc: k,
      operations: (prev?.operations ?? 0) + w.ops,
      arrivals: (prev?.arrivals ?? 0) + w.arrivals,
      departures: (prev?.departures ?? 0) + w.departures,
      // Unique counts within a week can only grow with more evidence.
      unique_pilots: Math.max(prev?.unique_pilots ?? 0, w.pilots.size),
      unique_aircraft: Math.max(prev?.unique_aircraft ?? 0, w.aircraft.size),
      observed_pax: (prev?.observed_pax ?? 0) + w.pax,
      observed_owner_pax: (prev?.observed_owner_pax ?? 0) + w.ownerPax,
      flights_observed: (prev?.flights_observed ?? 0) + w.flights,
      updated_at: nowIso,
    };
  });
  if (weekRows.length) {
    await supabaseAdmin
      .from("airport_spy_week")
      .upsert(weekRows, { onConflict: "icao,week_start_utc" });
  }

  // Pilots
  const pilotNames = [...agg.pilots.keys()];
  const { data: existingPilots } = await supabaseAdmin
    .from("airport_spy_pilot")
    .select("*")
    .eq("icao", icao)
    .in("pilot_username", pilotNames);
  const pilotByName = new Map((existingPilots ?? []).map((p) => [p.pilot_username as string, p]));
  const pilotRows = pilotNames.map((name) => {
    const p = agg.pilots.get(name)!;
    const prev = pilotByName.get(name) as
      | (Record<string, number> & { first_seen_at?: string; last_seen_at?: string })
      | undefined;
    const firstIso = new Date(p.first).toISOString();
    const lastIso = new Date(p.last).toISOString();
    return {
      icao,
      pilot_username: name,
      operations: (prev?.operations ?? 0) + p.ops,
      arrivals: (prev?.arrivals ?? 0) + p.arrivals,
      departures: (prev?.departures ?? 0) + p.departures,
      observed_pax: (prev?.observed_pax ?? 0) + p.pax,
      observed_owner_pax: (prev?.observed_owner_pax ?? 0) + p.ownerPax,
      first_seen_at:
        prev?.first_seen_at && prev.first_seen_at < firstIso ? prev.first_seen_at : firstIso,
      last_seen_at:
        prev?.last_seen_at && prev.last_seen_at > lastIso ? prev.last_seen_at : lastIso,
      updated_at: nowIso,
    };
  });
  if (pilotRows.length) {
    await supabaseAdmin
      .from("airport_spy_pilot")
      .upsert(pilotRows, { onConflict: "icao,pilot_username" });
  }

  // Traffic
  const trafficKeys = [...agg.traffic.keys()];
  const { data: existingTraffic } = await supabaseAdmin
    .from("airport_spy_traffic")
    .select("*")
    .eq("icao", icao);
  const trafficByKey = new Map(
    (existingTraffic ?? []).map((t) => [`${t.dimension}|${t.bucket}`, t]),
  );
  const trafficRows = trafficKeys.map((key) => {
    const [dimension, bucket] = key.split("|");
    const t = agg.traffic.get(key)!;
    const prev = trafficByKey.get(key) as Record<string, number> | undefined;
    return {
      icao,
      dimension,
      bucket,
      flights: (prev?.flights ?? 0) + t.flights,
      observed_pax: (prev?.observed_pax ?? 0) + t.pax,
      observed_owner_pax: (prev?.observed_owner_pax ?? 0) + t.ownerPax,
      updated_at: nowIso,
    };
  });
  if (trafficRows.length) {
    await supabaseAdmin
      .from("airport_spy_traffic")
      .upsert(trafficRows, { onConflict: "icao,dimension,bucket" });
  }
}

async function recomputeRecordTotals(icao: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data: weeks }, { count: pilotCount }, { data: types }] = await Promise.all([
    supabaseAdmin.from("airport_spy_week").select("*").eq("icao", icao),
    supabaseAdmin
      .from("airport_spy_pilot")
      .select("pilot_username", { count: "exact", head: true })
      .eq("icao", icao),
    supabaseAdmin
      .from("airport_spy_traffic")
      .select("bucket")
      .eq("icao", icao)
      .eq("dimension", "type"),
  ]);
  const rows = (weeks ?? []) as unknown as Record<string, number>[];
  const totals = rows.reduce(
    (acc, w) => {
      acc.ops += w.operations ?? 0;
      acc.arr += w.arrivals ?? 0;
      acc.dep += w.departures ?? 0;
      acc.flights += w.flights_observed ?? 0;
      return acc;
    },
    { ops: 0, arr: 0, dep: 0, flights: 0 },
  );
  await patchRecord(icao, {
    flights_analyzed: totals.flights,
    operations: totals.ops,
    arrivals: totals.arr,
    departures: totals.dep,
    weeks_covered: rows.length,
    unique_pilots: pilotCount ?? 0,
    unique_aircraft: (types ?? []).length,
  });
}

export type InvestigationResult = {
  icao: string;
  pagesWalked: number;
  flightsObserved: number;
  newFlights: number;
  status: "complete" | "failed";
  message: string;
};

/**
 * Walk an airport's public SimFly flight log and append what is observed.
 *
 * Two phases, both filtered by flight timestamp so nothing is double counted:
 *   1. recent — pages from the top, keeping only flights newer than the
 *      newest flight already recorded.
 *   2. deep   — pages beyond the recorded cursor, keeping only flights older
 *      than the oldest flight already recorded.
 */
export async function runInvestigation(opts: {
  icao: string;
  username: string;
  nonce: string;
  depthPages?: number;
}): Promise<InvestigationResult> {
  const icao = normaliseIcao(opts.icao);
  if (!icao) throw new Error("Invalid ICAO.");
  const depth = Math.min(Math.max(opts.depthPages ?? 18, PAGES_PER_CHUNK), 60);

  const existing = await readRecord(icao);
  const newestMs = existing?.newest_flight_at ? Date.parse(existing.newest_flight_at) : 0;
  const oldestMs = existing?.oldest_flight_at
    ? Date.parse(existing.oldest_flight_at)
    : Number.POSITIVE_INFINITY;
  const cursor = existing?.pages_walked ?? 0;
  const firstRun = !existing;

  await patchRecord(icao, {
    status: "running",
    progress_page: 0,
    progress_total: depth,
    progress_message: "Opening the public flight log…",
    error_message: null,
    ...(firstRun ? { first_observed_at: new Date().toISOString() } : {}),
  });

  const agg = emptyAggregate();
  let pagesWalked = 0;
  let observed = 0;

  try {
    // Identity / metadata straight from SimFly (observed, never guessed).
    const { getAirportSummary } = await import("./simfly.functions");
    const summary = await getAirportSummary({ data: { icao } });
    if (summary) {
      await patchRecord(icao, {
        name: summary.name,
        country: summary.country,
        tier: summary.category,
        level: summary.level,
      });
    }

    // Phase 1 — recent pages.
    let page = 1;
    let done = false;
    while (page <= Math.max(PAGES_PER_CHUNK, Math.round(depth / 3)) && !done) {
      await patchRecord(icao, {
        progress_page: pagesWalked,
        progress_message: `Reading recent activity — page ${page}`,
      });
      const { rows } = await collectAirportHistoryFlights(icao, opts.username, opts.nonce, {
        startPage: page,
        maxPages: PAGES_PER_CHUNK,
      });
      pagesWalked += PAGES_PER_CHUNK;
      observed += rows.length;
      const fresh = newestMs ? rows.filter((r) => r.tsMs > newestMs) : rows;
      ingest(agg, fresh);
      if (rows.length === 0) done = true;
      if (newestMs && fresh.length < rows.length) done = true; // reached known ground
      page += PAGES_PER_CHUNK;
    }

    // Phase 2 — deeper history beyond the recorded cursor.
    if (!firstRun || true) {
      let deepPage = Math.max(cursor + 1, page);
      const deepLimit = deepPage + depth;
      while (deepPage < deepLimit) {
        await patchRecord(icao, {
          progress_page: Math.min(pagesWalked, depth),
          progress_message: `Extending history — page ${deepPage}`,
        });
        const { rows } = await collectAirportHistoryFlights(icao, opts.username, opts.nonce, {
          startPage: deepPage,
          maxPages: PAGES_PER_CHUNK,
        });
        pagesWalked += PAGES_PER_CHUNK;
        observed += rows.length;
        if (rows.length === 0) break;
        const older = Number.isFinite(oldestMs) ? rows.filter((r) => r.tsMs < oldestMs) : rows;
        ingest(agg, older);
        deepPage += PAGES_PER_CHUNK;
      }
      await patchRecord(icao, { pages_walked: Math.max(cursor, deepPage - 1) });
    }

    await persist(icao, agg);

    const nowIso = new Date().toISOString();
    const patch: Record<string, unknown> = {
      status: "idle",
      progress_page: depth,
      progress_message: null,
      last_refreshed_at: nowIso,
      investigations: (existing?.investigations ?? 0) + 1,
    };
    if (agg.newest > 0) {
      const newIso = new Date(agg.newest).toISOString();
      if (!existing?.newest_flight_at || newIso > existing.newest_flight_at) {
        patch.newest_flight_at = newIso;
      }
    }
    if (Number.isFinite(agg.oldest)) {
      const oldIso = new Date(agg.oldest).toISOString();
      if (!existing?.oldest_flight_at || oldIso < existing.oldest_flight_at) {
        patch.oldest_flight_at = oldIso;
      }
    }
    await patchRecord(icao, patch);
    await recomputeRecordTotals(icao);

    return {
      icao,
      pagesWalked,
      flightsObserved: observed,
      newFlights: agg.flights,
      status: "complete",
      message:
        agg.flights > 0
          ? `${agg.flights} new observations recorded.`
          : "No new evidence found — the record already covers this range.",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await patchRecord(icao, {
      status: "failed",
      progress_message: null,
      error_message: message,
    });
    return {
      icao,
      pagesWalked,
      flightsObserved: observed,
      newFlights: 0,
      status: "failed",
      message,
    };
  }
}

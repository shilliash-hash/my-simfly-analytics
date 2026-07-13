// Server-only Alliance build pipeline.
// Filename `.server.ts` blocks this from client bundles. Imported dynamically
// from `alliance.functions.ts` handlers so nothing here ships to the browser.
//
// Splits the old single-pass generator into resumable phases:
//   P0 identity  → P1 discover my airports → P2 seed airport work items
//   P3 per-airport visitor scan (work items)
//   P4 aggregate visitor rows → seed pilot work items
//   P5 per-pilot portfolio enrichment (work items)
//   P6 finalize (recommendations + camps + totals)
//   P7 publish alliance_intel_cache
//
// The live cache is never overwritten with partial data. Intermediate results
// live on alliance_build_item.payload, keyed by build_id.

import type {
  AllianceAirport,
  AllianceCamp,
  AllianceIntelPayload,
  AlliancePilot,
  AllianceRecommendation,
  AllianceReturnStatus,
} from "./alliance.functions";

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const SIMFLY_BASE = "https://simfly.io/api";
const FETCH_TIMEOUT_MS = 12_000;
const MAX_PAGES_PER_AIRPORT = 1;
const MAX_ALLIED_PILOTS_FOR_PORTFOLIO = 40;
const CACHE_TTL_MS = 6 * 60 * 60_000;
const BUILD_STALE_MS = 30 * 60_000;
const DEFAULT_BUDGET_MS = 5_000;
const AIRPORT_SCAN_CONCURRENCY = 3;
const PILOT_ENRICH_CONCURRENCY = 4;

// -----------------------------------------------------------------------------
// Small helpers (fetch, tier mapping, aggregation math) — same logic as before
// -----------------------------------------------------------------------------

async function fetchJSON<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

const TIER_BY_CATEGORY: Record<number, { tier: string; label: string }> = {
  1: { tier: "T1", label: "Airstrip" },
  2: { tier: "T2", label: "Regional" },
  3: { tier: "T3", label: "Medium" },
  4: { tier: "T4", label: "Large" },
  5: { tier: "T5", label: "Major" },
  6: { tier: "T6", label: "Mega" },
};

function tierFor(cat?: number) {
  return TIER_BY_CATEGORY[cat ?? 0] ?? { tier: "T1", label: `C${cat ?? 0}` };
}

type RawAirportSide = {
  icao?: string;
  totalEarnedPax?: number;
  earnedPax?: number;
  bonusPax?: number;
  sharedPax?: number | null;
  pax?: number;
};

function airportSideCredit(side?: RawAirportSide): number {
  if (!side) return 0;
  const direct = side.totalEarnedPax ?? 0;
  if (direct > 0) return direct;
  const earned = side.earnedPax ?? side.pax ?? 0;
  const bonus = side.bonusPax ?? 0;
  const shared = side.sharedPax ?? 0;
  const withShared = earned + bonus + shared;
  if (withShared > 0) return withShared;
  return earned + bonus;
}

function assignCamp(rankIndex: number): AllianceCamp {
  if (rankIndex < 1) return "summit";
  if (rankIndex < 3) return "camp3";
  if (rankIndex < 6) return "camp2";
  if (rankIndex < 10) return "camp1";
  if (rankIndex < 16) return "base";
  return "trek";
}

function recommend(p: {
  allianceFactor: number;
  returnStatus: AllianceReturnStatus;
  bestTier: number;
  bestLevel: number;
  maxFreeSlots: number;
  totalWeeklySlots: number;
}): AllianceRecommendation {
  const slotPressure =
    p.totalWeeklySlots > 0 ? p.maxFreeSlots / p.totalWeeklySlots : 0;
  if (p.returnStatus === "outstanding" && p.allianceFactor > 50) {
    return { code: "high_yield", icon: "🔥", label: "High-Yield Return Route Available", tone: "instrument" };
  }
  if (p.returnStatus === "outstanding") {
    return { code: "return_recommended", icon: "✈", label: "Return Flight Recommended", tone: "instrument" };
  }
  if (p.maxFreeSlots === 0) {
    return { code: "nearly_full", icon: "⚠", label: "Airports Fully Booked This Cycle", tone: "muted" };
  }
  if (p.bestTier >= 5 && p.bestLevel >= 8 && p.allianceFactor > 100) {
    return { code: "excellent", icon: "🏆", label: "Excellent Alliance Partner", tone: "gold" };
  }
  if (slotPressure > 0.4) {
    return { code: "free_slots", icon: "🟢", label: "Plenty of Free Slots — Fly Now", tone: "runway" };
  }
  return { code: "watch", icon: "🛰", label: "Monitor — Slots Filling Up", tone: "muted" };
}

// -----------------------------------------------------------------------------
// Raw SimFly response shapes
// -----------------------------------------------------------------------------

type RawAirportHistFlight = {
  flightID?: string;
  departureTime?: string;
  takeoffTime?: string;
  landingTime?: string;
  pax?: number;
  pilot?: { username?: string; usernonce?: number; avatar?: string };
  airplane?: { owner?: { username?: string; nonce?: number } };
  origin?: RawAirportSide;
  destination?: RawAirportSide;
};
type RawAirportHistPage = { flights?: RawAirportHistFlight[] };
type RawAssetsAll = {
  items?: Array<{
    type: string;
    icao?: string;
    name?: string;
    level?: number;
    category?: number;
    rotation?: number;
    maxRotation?: number;
  }>;
};
type RawProfile = { username?: string; avatar?: string };

// -----------------------------------------------------------------------------
// Per-airport payload (stored on alliance_build_item where kind = 'airport')
// -----------------------------------------------------------------------------

type AirportSlicePilot = {
  username: string;
  nonce: number | null;
  avatarUrl?: string;
  visits: number;
  paxForMe: number;
  lastVisitAt: string;
  lastVisitMs: number;
};

type AirportSlice = {
  icao: string;
  pilots: AirportSlicePilot[];
};

// Per-pilot payload (stored on alliance_build_item where kind = 'pilot')
type PilotEnrichPayload = {
  username: string;
  nonce: number | null;
  avatarUrl?: string;
  airports: AllianceAirport[];
};

// -----------------------------------------------------------------------------
// Job/item row shapes
// -----------------------------------------------------------------------------

export type BuildPhase =
  | "queued"
  | "scanning"
  | "aggregating"
  | "enriching"
  | "finalizing"
  | "done"
  | "failed";

export type BuildJobRow = {
  username: string;
  build_id: string;
  phase: BuildPhase;
  airports_total: number;
  airports_done: number;
  pilots_total: number;
  pilots_done: number;
  error_message: string | null;
  started_at: string;
  updated_at: string;
};

type ItemRow = {
  build_id: string;
  kind: "airport" | "pilot";
  key: string;
  status: "pending" | "in_progress" | "done" | "failed";
  attempts: number;
  payload: unknown;
};

// -----------------------------------------------------------------------------
// Snapshot readers used by getAllianceStatus
// -----------------------------------------------------------------------------

export async function getBuildSnapshot(username: string): Promise<{
  cache: AllianceIntelPayload | null;
  cacheFresh: boolean;
  job: BuildJobRow | null;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data: cacheRow }, { data: jobRow }] = await Promise.all([
    supabaseAdmin
      .from("alliance_intel_cache" as never)
      .select("payload, refresh_after")
      .eq("username", username)
      .maybeSingle(),
    supabaseAdmin
      .from("alliance_build_job" as never)
      .select("*")
      .eq("username", username)
      .maybeSingle(),
  ]);
  const cache = (cacheRow as { payload: AllianceIntelPayload; refresh_after: string } | null) ?? null;
  const cacheFresh = cache
    ? new Date(cache.refresh_after).getTime() > Date.now()
    : false;
  return {
    cache: cache?.payload ?? null,
    cacheFresh,
    job: (jobRow as BuildJobRow | null) ?? null,
  };
}

// -----------------------------------------------------------------------------
// Worker entrypoint
// -----------------------------------------------------------------------------

export async function advanceBuild(opts: {
  username?: string;
  force?: boolean;
  budgetMs?: number;
}): Promise<{ phase: BuildPhase; job: BuildJobRow | null }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { getSessionIdentity } = await import("@/lib/identity.server");
  const identity = await getSessionIdentity({ username: opts.username });
  const username = identity.username;
  const nonce = identity.nonce;
  const budgetMs = opts.budgetMs ?? DEFAULT_BUDGET_MS;
  const deadline = Date.now() + budgetMs;
  const timeLeft = () => deadline - Date.now();

  // ---------------------------------------------------------------------------
  // Load or create job
  // ---------------------------------------------------------------------------
  const { data: existing } = await supabaseAdmin
    .from("alliance_build_job" as never)
    .select("*")
    .eq("username", username)
    .maybeSingle();
  let job = (existing as BuildJobRow | null) ?? null;

  const shouldRestart =
    opts.force === true ||
    !job ||
    job.phase === "failed" ||
    (job.phase === "done" &&
      Date.now() - new Date(job.updated_at).getTime() > CACHE_TTL_MS) ||
    (job.phase !== "done" &&
      Date.now() - new Date(job.updated_at).getTime() > BUILD_STALE_MS);

  if (shouldRestart) {
    job = await initBuild(username, nonce);
    if (!job) {
      // No airports → publish empty payload immediately
      await publishEmptyCache(username);
      return { phase: "done", job: null };
    }
  }

  if (!job) return { phase: "queued", job: null };

  // ---------------------------------------------------------------------------
  // Phase machine — process until phase transitions to done/failed or budget out
  // ---------------------------------------------------------------------------
  while (job.phase !== "done" && job.phase !== "failed" && timeLeft() > 500) {
    if (job.phase === "scanning") {
      await runScanSlice(job, nonce, timeLeft);
      job = await maybeAdvanceToAggregating(job);
      continue;
    }
    if (job.phase === "aggregating") {
      job = await runAggregation(job);
      continue;
    }
    if (job.phase === "enriching") {
      await runEnrichSlice(job, timeLeft);
      job = await maybeAdvanceToFinalizing(job);
      continue;
    }
    if (job.phase === "finalizing") {
      job = await runFinalize(job);
      continue;
    }
    if (job.phase === "queued") {
      job = await patchJob(job.username, { phase: "scanning" });
      continue;
    }
    break;
  }

  return { phase: job.phase, job };
}

// -----------------------------------------------------------------------------
// Phase 0/1/2 — init
// -----------------------------------------------------------------------------

async function initBuild(
  username: string,
  nonce: string,
): Promise<BuildJobRow | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const qs = `username=${encodeURIComponent(username)}&nonce=${encodeURIComponent(nonce)}`;
  const myAssets = await fetchJSON<RawAssetsAll>(
    `${SIMFLY_BASE}/user/assets/all?${qs}`,
  );
  const icaos = (myAssets?.items ?? [])
    .filter((it) => it.type === "Airport" && typeof it.icao === "string")
    .map((it) => String(it.icao));

  if (icaos.length === 0) return null;

  const build_id = crypto.randomUUID();
  const now = new Date().toISOString();

  // Reset any prior items for this user's previous build, then seed new items.
  const { data: prev } = await supabaseAdmin
    .from("alliance_build_job" as never)
    .select("build_id")
    .eq("username", username)
    .maybeSingle();
  const prevBuildId = (prev as { build_id: string } | null)?.build_id;
  if (prevBuildId) {
    await supabaseAdmin
      .from("alliance_build_item" as never)
      .delete()
      .eq("build_id", prevBuildId);
  }

  await supabaseAdmin
    .from("alliance_build_job" as never)
    .upsert(
      {
        username,
        build_id,
        phase: "scanning",
        airports_total: icaos.length,
        airports_done: 0,
        pilots_total: 0,
        pilots_done: 0,
        error_message: null,
        started_at: now,
        updated_at: now,
      } as never,
      { onConflict: "username" } as never,
    );

  const itemRows = icaos.map((icao) => ({
    build_id,
    kind: "airport",
    key: icao,
    status: "pending",
    attempts: 0,
    payload: null,
    updated_at: now,
  }));
  await supabaseAdmin
    .from("alliance_build_item" as never)
    .insert(itemRows as never);

  const { data: fresh } = await supabaseAdmin
    .from("alliance_build_job" as never)
    .select("*")
    .eq("username", username)
    .maybeSingle();
  return (fresh as BuildJobRow | null) ?? null;
}

async function publishEmptyCache(username: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const payload: AllianceIntelPayload = {
    generatedAt: new Date().toISOString(),
    me: { username },
    totals: { pilots: 0, totalAllianceFactor: 0, outstandingReturns: 0 },
    pilots: [],
  };
  await (supabaseAdmin as unknown as {
    from: (t: string) => {
      upsert: (row: Record<string, unknown>, opts: { onConflict: string }) => Promise<unknown>;
    };
  })
    .from("alliance_intel_cache")
    .upsert(
      {
        username,
        payload,
        generated_at: payload.generatedAt,
        refresh_after: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
      },
      { onConflict: "username" },
    );
  await supabaseAdmin
    .from("alliance_build_job" as never)
    .upsert(
      {
        username,
        phase: "done",
        airports_total: 0,
        airports_done: 0,
        pilots_total: 0,
        pilots_done: 0,
        error_message: null,
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "username" } as never,
    );
}

// -----------------------------------------------------------------------------
// Phase 3 — per-airport scan (work items)
// -----------------------------------------------------------------------------

async function runScanSlice(
  job: BuildJobRow,
  nonce: string,
  timeLeft: () => number,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  while (timeLeft() > 1500) {
    const { data: pending } = await supabaseAdmin
      .from("alliance_build_item" as never)
      .select("build_id, kind, key, status, attempts, payload")
      .eq("build_id", job.build_id)
      .eq("kind", "airport")
      .eq("status", "pending")
      .limit(AIRPORT_SCAN_CONCURRENCY);
    const items = (pending as ItemRow[] | null) ?? [];
    if (items.length === 0) break;

    // Mark in_progress
    await supabaseAdmin
      .from("alliance_build_item" as never)
      .update({ status: "in_progress", updated_at: new Date().toISOString() } as never)
      .in("key", items.map((i) => i.key) as never)
      .eq("build_id", job.build_id)
      .eq("kind", "airport");

    await Promise.all(
      items.map(async (it) => {
        try {
          const slice = await scanAirport(job.username, nonce, it.key);
          await supabaseAdmin
            .from("alliance_build_item" as never)
            .update({
              status: "done",
              payload: slice as never,
              attempts: it.attempts + 1,
              updated_at: new Date().toISOString(),
            } as never)
            .eq("build_id", job.build_id)
            .eq("kind", "airport")
            .eq("key", it.key);
        } catch (err) {
          const attempts = it.attempts + 1;
          await supabaseAdmin
            .from("alliance_build_item" as never)
            .update({
              status: attempts >= 3 ? "failed" : "pending",
              attempts,
              updated_at: new Date().toISOString(),
            } as never)
            .eq("build_id", job.build_id)
            .eq("kind", "airport")
            .eq("key", it.key);
          console.error(
            `[Alliance Worker] scan airport ${it.key} failed (attempt ${attempts})`,
            err,
          );
        }
      }),
    );

    await refreshCounts(job, "airport");
  }
}

async function scanAirport(
  username: string,
  nonce: string,
  icao: string,
): Promise<AirportSlice> {
  const qs = `username=${encodeURIComponent(username)}&nonce=${encodeURIComponent(nonce)}`;
  const perPilot = new Map<string, AirportSlicePilot>();
  for (let p = 1; p <= MAX_PAGES_PER_AIRPORT; p += 1) {
    const page = await fetchJSON<RawAirportHistPage>(
      `${SIMFLY_BASE}/user/assets/airport/${encodeURIComponent(icao)}/flights?${qs}&page=${p}`,
    );
    const flights = page?.flights ?? [];
    if (flights.length === 0) break;
    for (const raw of flights) {
      const pilot = raw.pilot?.username?.trim();
      if (!pilot) continue;
      if (pilot.toLowerCase() === username.toLowerCase()) continue;
      const ts = raw.landingTime ?? raw.takeoffTime ?? raw.departureTime ?? "";
      const tsMs = ts ? new Date(ts).getTime() : 0;
      const role: "takeoff" | "landing" =
        raw.destination?.icao === icao ? "landing" : "takeoff";
      if (role === "takeoff" && raw.origin?.icao !== icao) continue;
      const pax =
        role === "takeoff"
          ? airportSideCredit(raw.origin)
          : airportSideCredit(raw.destination);

      const inferredNonce =
        typeof raw.pilot?.usernonce === "number"
          ? raw.pilot.usernonce
          : typeof raw.airplane?.owner?.nonce === "number"
            ? raw.airplane.owner.nonce
            : null;

      const cur =
        perPilot.get(pilot) ??
        ({
          username: pilot,
          nonce: inferredNonce,
          avatarUrl: raw.pilot?.avatar
            ? `https://simfly.io/${raw.pilot.avatar.replace(/^(\.\.\/)+/, "")}`
            : undefined,
          visits: 0,
          paxForMe: 0,
          lastVisitMs: 0,
          lastVisitAt: ts,
        } satisfies AirportSlicePilot);
      cur.visits += 1;
      cur.paxForMe += pax;
      if (tsMs > cur.lastVisitMs) {
        cur.lastVisitMs = tsMs;
        cur.lastVisitAt = ts;
      }
      if (cur.nonce == null && inferredNonce != null) cur.nonce = inferredNonce;
      if (!cur.avatarUrl && raw.pilot?.avatar) {
        cur.avatarUrl = `https://simfly.io/${raw.pilot.avatar.replace(/^(\.\.\/)+/, "")}`;
      }
      perPilot.set(pilot, cur);
    }
  }
  return { icao, pilots: [...perPilot.values()] };
}

async function maybeAdvanceToAggregating(
  job: BuildJobRow,
): Promise<BuildJobRow> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count: pending } = await supabaseAdmin
    .from("alliance_build_item" as never)
    .select("*", { count: "exact", head: true })
    .eq("build_id", job.build_id)
    .eq("kind", "airport")
    .in("status", ["pending", "in_progress"] as never);
  if ((pending ?? 0) > 0) return job;
  return await patchJob(job.username, { phase: "aggregating" });
}

// -----------------------------------------------------------------------------
// Phase 4 — aggregate
// -----------------------------------------------------------------------------

async function runAggregation(job: BuildJobRow): Promise<BuildJobRow> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: rows } = await supabaseAdmin
    .from("alliance_build_item" as never)
    .select("payload")
    .eq("build_id", job.build_id)
    .eq("kind", "airport")
    .eq("status", "done");

  const byPilot = new Map<string, AirportSlicePilot & { allianceFactor: number }>();
  for (const r of (rows as { payload: AirportSlice | null }[] | null) ?? []) {
    const slice = r.payload;
    if (!slice) continue;
    for (const p of slice.pilots) {
      const cur = byPilot.get(p.username);
      if (!cur) {
        byPilot.set(p.username, { ...p, allianceFactor: 0 });
        continue;
      }
      cur.visits += p.visits;
      cur.paxForMe += p.paxForMe;
      if (p.lastVisitMs > cur.lastVisitMs) {
        cur.lastVisitMs = p.lastVisitMs;
        cur.lastVisitAt = p.lastVisitAt;
      }
      if (cur.nonce == null && p.nonce != null) cur.nonce = p.nonce;
      if (!cur.avatarUrl && p.avatarUrl) cur.avatarUrl = p.avatarUrl;
    }
  }
  for (const v of byPilot.values()) v.allianceFactor = v.visits * v.paxForMe;

  const ranked = [...byPilot.values()]
    .sort((a, b) => b.allianceFactor - a.allianceFactor)
    .slice(0, MAX_ALLIED_PILOTS_FOR_PORTFOLIO);

  const now = new Date().toISOString();
  if (ranked.length > 0) {
    await supabaseAdmin.from("alliance_build_item" as never).insert(
      ranked.map((p) => ({
        build_id: job.build_id,
        kind: "pilot",
        key: p.username,
        status: "pending",
        attempts: 0,
        payload: {
          seed: p, // carry aggregation totals so finalize has them without re-reading airport slices
        },
        updated_at: now,
      })) as never,
    );
  }

  return await patchJob(job.username, {
    phase: ranked.length > 0 ? "enriching" : "finalizing",
    pilots_total: ranked.length,
    pilots_done: 0,
  });
}

// -----------------------------------------------------------------------------
// Phase 5 — per-pilot enrichment
// -----------------------------------------------------------------------------

async function runEnrichSlice(job: BuildJobRow, timeLeft: () => number) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  while (timeLeft() > 1500) {
    const { data: pending } = await supabaseAdmin
      .from("alliance_build_item" as never)
      .select("build_id, kind, key, status, attempts, payload")
      .eq("build_id", job.build_id)
      .eq("kind", "pilot")
      .eq("status", "pending")
      .limit(PILOT_ENRICH_CONCURRENCY);
    const items = (pending as ItemRow[] | null) ?? [];
    if (items.length === 0) break;

    await supabaseAdmin
      .from("alliance_build_item" as never)
      .update({ status: "in_progress", updated_at: new Date().toISOString() } as never)
      .in("key", items.map((i) => i.key) as never)
      .eq("build_id", job.build_id)
      .eq("kind", "pilot");

    await Promise.all(
      items.map(async (it) => {
        try {
          const seed = ((it.payload as { seed?: AirportSlicePilot } | null) ?? {}).seed;
          const enrich = await enrichPilot(it.key, seed ?? null);
          await supabaseAdmin
            .from("alliance_build_item" as never)
            .update({
              status: "done",
              payload: { seed, enrich } as never,
              attempts: it.attempts + 1,
              updated_at: new Date().toISOString(),
            } as never)
            .eq("build_id", job.build_id)
            .eq("kind", "pilot")
            .eq("key", it.key);
        } catch (err) {
          const attempts = it.attempts + 1;
          await supabaseAdmin
            .from("alliance_build_item" as never)
            .update({
              status: attempts >= 3 ? "failed" : "pending",
              attempts,
              updated_at: new Date().toISOString(),
            } as never)
            .eq("build_id", job.build_id)
            .eq("kind", "pilot")
            .eq("key", it.key);
          console.error(
            `[Alliance Worker] enrich pilot ${it.key} failed (attempt ${attempts})`,
            err,
          );
        }
      }),
    );

    await refreshCounts(job, "pilot");
  }
}

async function enrichPilot(
  username: string,
  seed: AirportSlicePilot | null,
): Promise<PilotEnrichPayload> {
  let avatarUrl = seed?.avatarUrl;
  let airports: AllianceAirport[] = [];
  const nonce = seed?.nonce ?? null;

  if (nonce != null) {
    const pQs = `username=${encodeURIComponent(username)}&nonce=${encodeURIComponent(String(nonce))}`;
    const [profile, assets] = await Promise.all([
      avatarUrl
        ? Promise.resolve(null)
        : fetchJSON<RawProfile>(`${SIMFLY_BASE}/user/v2/?${pQs}`),
      fetchJSON<RawAssetsAll>(`${SIMFLY_BASE}/user/assets/all?${pQs}`),
    ]);
    if (!avatarUrl && profile?.avatar) {
      avatarUrl = `https://simfly.io/${profile.avatar.replace(/^(\.\.\/)+/, "")}`;
    }
    airports = (assets?.items ?? [])
      .filter((it) => it.type === "Airport" && typeof it.icao === "string")
      .map((it) => {
        const t = tierFor(it.category);
        const used = it.rotation ?? 0;
        const cap = it.maxRotation ?? 0;
        return {
          icao: String(it.icao),
          name: it.name ?? "",
          tier: t.tier,
          tierLabel: t.label,
          level: it.level ?? 0,
          weeklySlots: cap,
          usedSlots: used,
          freeSlots: Math.max(0, cap - used),
        } satisfies AllianceAirport;
      })
      .sort((a, b) => b.weeklySlots - a.weeklySlots);
  }

  return { username, nonce, avatarUrl, airports };
}

async function maybeAdvanceToFinalizing(
  job: BuildJobRow,
): Promise<BuildJobRow> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count: pending } = await supabaseAdmin
    .from("alliance_build_item" as never)
    .select("*", { count: "exact", head: true })
    .eq("build_id", job.build_id)
    .eq("kind", "pilot")
    .in("status", ["pending", "in_progress"] as never);
  if ((pending ?? 0) > 0) return job;
  return await patchJob(job.username, { phase: "finalizing" });
}

// -----------------------------------------------------------------------------
// Phase 6/7 — finalize + publish
// -----------------------------------------------------------------------------

async function runFinalize(job: BuildJobRow): Promise<BuildJobRow> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const myFlownIcaos = await (async () => {
    try {
      const { data: rows } = await supabaseAdmin
        .from("simfly_flights")
        .select("departure_icao,destination_icao")
        .eq("username", job.username)
        .limit(20000);
      const set = new Set<string>();
      for (const r of rows ?? []) {
        if (r.departure_icao) set.add(String(r.departure_icao));
        if (r.destination_icao) set.add(String(r.destination_icao));
      }
      return set;
    } catch {
      return new Set<string>();
    }
  })();

  const { data: pilotRows } = await supabaseAdmin
    .from("alliance_build_item" as never)
    .select("payload, status")
    .eq("build_id", job.build_id)
    .eq("kind", "pilot");

  const pilots: AlliancePilot[] = [];
  for (const r of (pilotRows as { payload: { seed?: AirportSlicePilot; enrich?: PilotEnrichPayload } | null; status: string }[] | null) ?? []) {
    const seed = r.payload?.seed;
    if (!seed) continue;
    const enrich = r.payload?.enrich;
    const airports = enrich?.airports ?? [];
    const avatarUrl = enrich?.avatarUrl ?? seed.avatarUrl;
    const nonce = enrich?.nonce ?? seed.nonce ?? null;

    const allianceFactor = seed.visits * seed.paxForMe;
    const totalWeeklySlots = airports.reduce((s, a) => s + a.weeklySlots, 0);
    const totalFreeSlots = airports.reduce((s, a) => s + a.freeSlots, 0);
    const maxFreeSlots = airports.reduce((m, a) => Math.max(m, a.freeSlots), 0);
    const bestTier = airports.reduce((m, a) => {
      const n = Number(a.tier.replace(/^T/, "")) || 0;
      return n > m ? n : m;
    }, 0);
    const bestLevel = airports.reduce((m, a) => Math.max(m, a.level), 0);

    const returnStatus: AllianceReturnStatus =
      airports.some((a) => myFlownIcaos.has(a.icao)) ? "completed" : "outstanding";

    const recommendation = recommend({
      allianceFactor,
      returnStatus,
      bestTier,
      bestLevel,
      maxFreeSlots,
      totalWeeklySlots,
    });

    pilots.push({
      username: seed.username,
      nonce,
      avatarUrl,
      visits: seed.visits,
      paxForMe: Math.round(seed.paxForMe * 100) / 100,
      allianceFactor: Math.round(allianceFactor * 100) / 100,
      lastVisitAt: seed.lastVisitAt,
      returnStatus,
      camp: "trek",
      airports,
      totalFreeSlots,
      totalWeeklySlots,
      recommendation,
    });
  }

  pilots.sort((a, b) => b.allianceFactor - a.allianceFactor);
  pilots.forEach((p, i) => {
    p.camp = assignCamp(i);
  });

  const outstandingReturns = pilots.filter(
    (p) => p.returnStatus === "outstanding",
  ).length;
  const totalAllianceFactor =
    Math.round(pilots.reduce((s, p) => s + p.allianceFactor, 0) * 100) / 100;

  const payload: AllianceIntelPayload = {
    generatedAt: new Date().toISOString(),
    me: { username: job.username },
    totals: {
      pilots: pilots.length,
      totalAllianceFactor,
      outstandingReturns,
    },
    pilots,
  };

  await (supabaseAdmin as unknown as {
    from: (t: string) => {
      upsert: (row: Record<string, unknown>, opts: { onConflict: string }) => Promise<unknown>;
    };
  })
    .from("alliance_intel_cache")
    .upsert(
      {
        username: job.username,
        payload,
        generated_at: payload.generatedAt,
        refresh_after: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
      },
      { onConflict: "username" },
    );

  // Prune the ledger so it doesn't accumulate — the published cache is
  // now the source of truth for this build_id.
  await supabaseAdmin
    .from("alliance_build_item" as never)
    .delete()
    .eq("build_id", job.build_id);

  return await patchJob(job.username, { phase: "done" });
}

// -----------------------------------------------------------------------------
// Helpers: job counts + patch
// -----------------------------------------------------------------------------

async function refreshCounts(
  job: BuildJobRow,
  kind: "airport" | "pilot",
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ count: total }, { count: done }] = await Promise.all([
    supabaseAdmin
      .from("alliance_build_item" as never)
      .select("*", { count: "exact", head: true })
      .eq("build_id", job.build_id)
      .eq("kind", kind),
    supabaseAdmin
      .from("alliance_build_item" as never)
      .select("*", { count: "exact", head: true })
      .eq("build_id", job.build_id)
      .eq("kind", kind)
      .eq("status", "done"),
  ]);
  const patch =
    kind === "airport"
      ? { airports_total: total ?? 0, airports_done: done ?? 0 }
      : { pilots_total: total ?? 0, pilots_done: done ?? 0 };
  await patchJob(job.username, patch);
}

async function patchJob(
  username: string,
  patch: Partial<Omit<BuildJobRow, "username" | "build_id" | "started_at">>,
): Promise<BuildJobRow> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("alliance_build_job" as never)
    .update({ ...patch, updated_at: new Date().toISOString() } as never)
    .eq("username", username)
    .select("*")
    .maybeSingle();
  return data as unknown as BuildJobRow;
}

// -----------------------------------------------------------------------------
// Cron helper — advance every in-flight build
// -----------------------------------------------------------------------------

export async function advanceAllPendingBuilds(perJobBudgetMs = 4000) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: jobs } = await supabaseAdmin
    .from("alliance_build_job" as never)
    .select("username, phase, updated_at")
    .not("phase", "in", "(done,failed)" as never);
  const list = (jobs as { username: string }[] | null) ?? [];
  const results: Array<{ username: string; phase: BuildPhase }> = [];
  for (const j of list) {
    try {
      const r = await advanceBuild({
        username: j.username,
        budgetMs: perJobBudgetMs,
      });
      results.push({ username: j.username, phase: r.phase });
    } catch (err) {
      results.push({ username: j.username, phase: "failed" });
      console.error(`[Alliance Cron] advance ${j.username} failed`, err);
    }
  }
  return results;
}

import { createServerFn } from "@tanstack/react-start";

// -----------------------------------------------------------------------------
// Alliance Intelligence — public types + client-callable server functions.
// Heavy pipeline logic lives in `alliance-pipeline.server.ts` (server-only).
// This file stays client-safe so components can import the types.
// -----------------------------------------------------------------------------

export type AllianceAirport = {
  icao: string;
  name: string;
  tier: string;
  tierLabel: string;
  level: number;
  weeklySlots: number;
  usedSlots: number;
  freeSlots: number;
};

export type AllianceCamp = "summit" | "camp3" | "camp2" | "camp1" | "base" | "trek";
export type AllianceReturnStatus = "completed" | "outstanding";

export type AllianceRecommendation = {
  code:
    | "high_yield"
    | "free_slots"
    | "nearly_full"
    | "excellent"
    | "return_recommended"
    | "watch";
  icon: string;
  label: string;
  tone: "runway" | "instrument" | "gold" | "muted";
};

export type AlliancePilot = {
  username: string;
  nonce: number | null;
  avatarUrl?: string;
  visits: number;
  paxForMe: number;
  allianceFactor: number;
  lastVisitAt: string;
  returnStatus: AllianceReturnStatus;
  camp: AllianceCamp;
  airports: AllianceAirport[];
  totalFreeSlots: number;
  totalWeeklySlots: number;
  recommendation: AllianceRecommendation;
};

export type AllianceIntelPayload = {
  generatedAt: string;
  me: { username: string };
  totals: {
    pilots: number;
    totalAllianceFactor: number;
    outstandingReturns: number;
  };
  pilots: AlliancePilot[];
};

export type AllianceBuildProgress = {
  phase:
    | "queued"
    | "scanning"
    | "aggregating"
    | "enriching"
    | "finalizing"
    | "done"
    | "failed";
  airportsTotal: number;
  airportsDone: number;
  pilotsTotal: number;
  pilotsDone: number;
  startedAt: string;
  updatedAt: string;
  errorMessage: string | null;
};

export type AllianceStatus =
  | { status: "ready"; payload: AllianceIntelPayload; progress: AllianceBuildProgress | null }
  | { status: "building"; payload: AllianceIntelPayload | null; progress: AllianceBuildProgress };

// -----------------------------------------------------------------------------
// getAllianceStatus — cache read + kickoff/advance
// -----------------------------------------------------------------------------
// Contract:
//  - Fresh cache exists and no active build → { status: 'ready' }
//  - Otherwise ensure a build is running and execute a bounded worker slice,
//    then return current progress. Client polls this while status=='building'.
// -----------------------------------------------------------------------------

export const getAllianceStatus = createServerFn({ method: "GET" })
  .inputValidator((d?: { username?: string; force?: boolean }) => d ?? {})
  .handler(async ({ data }): Promise<AllianceStatus> => {
    const { getSessionIdentity } = await import("@/lib/identity.server");
    const identity = await getSessionIdentity({ username: data?.username });
    const username = identity.username;
    const force = data?.force === true;

    const { advanceBuild, getBuildSnapshot } = await import(
      "@/lib/alliance-pipeline.server"
    );

    // 1) Cache-first: if fresh and not forcing a rebuild, return immediately.
    if (!force) {
      const snap = await getBuildSnapshot(username);
      if (snap.cacheFresh && snap.cache && (!snap.job || snap.job.phase === "done")) {
        return {
          status: "ready",
          payload: snap.cache,
          progress: snap.job ? toProgress(snap.job) : null,
        };
      }
    }

    // 2) Run one bounded worker slice (kickoff if no job exists).
    //await advanceBuild({ username, force, budgetMs: 5_000 });

    // 3) Re-read snapshot and report status.
    const after = await getBuildSnapshot(username);
    if (after.job?.phase === "done" && after.cache) {
      return {
        status: "ready",
        payload: after.cache,
        progress: toProgress(after.job),
      };
    }
     // 🟢 AUTONOMICZNY SILNIK LOKALNY: Budujemy profil CRM wyłącznie na podstawie naszej tabeli simfly_flights!
  if (!after.job || after.job.phase === "completed" || after.job.phase === "done" || after.job.airports_total === 0) {
    
    // 1. Pobieramy realne misje innych pilotów bezpośrednio z naszej tabeli
    const { data: localFlights } = await supabaseAdmin
      .from("simfly_flights")
      .select("pilot, origin_icao, destination_icao, created_at, pax_count")
      .eq("status", "COMPLETED")
      .not("pilot", "eq", username); // wykluczamy Shilla, zliczamy tylko sojuszników

    const hasFlights = localFlights && localFlights.length > 0;
    
    // Fallback: Jeśli baza misji jest pusta, oddajemy krystalicznie czysty Day Zero
    if (!hasFlights) {
      return {
        status: "ready",
        payload: after.cache || {
          generatedAt: new Date().toISOString(),
          me: { username },
          totals: { pilots: 0, totalAllianceFactor: 0, outstandingReturns: 0 },
          pilots: []
        },
        progress: after.job ? toProgress(after.job) : null,
      };
    }

    // 2. 📊 PEŁNY PARSER LOKALNY: Agregujemy statystyki bezpośrednio z pobranych logów!
    const pilotStats = new Map<string, { visits: number; totalPax: number; lastVisit: string }>();

    for (const f of localFlights) {
      const pName = f.pilot;
      if (!pName) continue;

      const cur = pilotStats.get(pName) || { visits: 0, totalPax: 0, lastVisit: f.created_at };
      cur.visits += 1;
      cur.totalPax += (f.pax_count ?? 0);
      
      if (new Date(f.created_at).getTime() > new Date(cur.lastVisit).getTime()) {
        cur.lastVisit = f.created_at;
      }
      pilotStats.set(pName, cur);
    }

    // 3. Mapujemy zagregowane dane do oficjalnej struktury AlliancePilot oczekiwanej przez frontend
    const mappedPilots = Array.from(pilotStats.entries()).map(([pName, stats]) => {
      const allianceFactor = stats.visits * stats.totalPax;
      return {
        username: pName,
        nonce: null, // nie potrzebujemy już nonce z SimFly!
        avatarUrl: undefined, // frontend automatycznie podstawi literę (L, P), dopóki nie wdrożymy lokalnych awatarów
        visits: stats.visits,
        paxForMe: stats.totalPax,
        allianceFactor: Math.round(allianceFactor * 100) / 100,
        lastVisitAt: stats.lastVisit,
        returnStatus: "completed" as const, // na bazie zamkniętych lotów u Ciebie status to zawsze completed
        camp: "trek" as const, // ranga startowa
        airports: [], // pomijamy puste assets z SimFly
        totalFreeSlots: 0,
        totalWeeklySlots: 0,
        recommendation: { code: "free_slots", icon: " ", label: "Local Alliance Active 🟢", tone: "runway" as const }
      };
    });

    // Sortujemy pilotów od najwyższego Alliance Factor (tak jak chciał oryginalny algorytm bota)
    mappedPilots.sort((a, b) => b.allianceFactor - a.allianceFactor);

    // Przypisujemy obozy (Camps) na podstawie pozycji w rankingu
    mappedPilots.forEach((p, index) => {
      if (index < 1) p.camp = "summit";
      else if (index < 3) p.camp = "camp3";
      else if (index < 6) p.camp = "camp2";
      else if (index < 10) p.camp = "camp1";
      else p.camp = "base";
    });

    const totalAllianceFactor = Math.round(mappedPilots.reduce((s, p) => s + p.allianceFactor, 0) * 100) / 100;

    // Zwracamy w 100% dynamiczny, gotowy payload wyliczony w milisekundy prosto z Twojej bazy!
    return {
      status: "ready",
      payload: {
        generatedAt: new Date().toISOString(),
        me: { username },
        totals: {
          pilots: mappedPilots.length,
          totalAllianceFactor,
          outstandingReturns: 0
        },
        pilots: mappedPilots
      },
      progress: after.job ? toProgress(after.job) : null,
    };
  }


// -----------------------------------------------------------------------------
// tickAllianceBuild — cron/manual worker tick that advances every in-flight
// build. Called from `/api/public/hooks/alliance-build-tick`.
// -----------------------------------------------------------------------------

export const tickAllianceBuild = createServerFn({ method: "POST" })
  .inputValidator((d?: { perJobBudgetMs?: number }) => d ?? {})
  .handler(async ({ data }) => {
    const { advanceAllPendingBuilds } = await import(
      "@/lib/alliance-pipeline.server"
    );
    const results = await advanceAllPendingBuilds(data?.perJobBudgetMs ?? 4000);
    return { ok: true, processed: results.length, results };
  });

// -----------------------------------------------------------------------------
// Local helpers
// -----------------------------------------------------------------------------

type JobRowLike = {
  phase: AllianceBuildProgress["phase"];
  airports_total: number;
  airports_done: number;
  pilots_total: number;
  pilots_done: number;
  started_at: string;
  updated_at: string;
  error_message: string | null;
};

function toProgress(job: JobRowLike): AllianceBuildProgress {
  return {
    phase: job.phase,
    airportsTotal: job.airports_total,
    airportsDone: job.airports_done,
    pilotsTotal: job.pilots_total,
    pilotsDone: job.pilots_done,
    startedAt: job.started_at,
    updatedAt: job.updated_at,
    errorMessage: job.error_message,
  };
}

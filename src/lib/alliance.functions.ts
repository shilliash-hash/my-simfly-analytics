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
  /** How many of my flights landed at one of this pilot's airports. */
  returnFlights?: number;
  /** Most recent matching return flight (mission_start_ts), ISO. */
  lastReturnAt?: string | null;
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
    await advanceBuild({ username, force, budgetMs: 5_000 });

    // 3) Re-read snapshot and report status.
    const after = await getBuildSnapshot(username);
    if (after.job?.phase === "done" && after.cache) {
      return {
        status: "ready",
        payload: after.cache,
        progress: toProgress(after.job),
      };
    }
    return {
      status: "building",
      payload: after.cache, // stale cache (if any) shown as fallback in UI
      progress: after.job
        ? toProgress(after.job)
        : {
            phase: "queued",
            airportsTotal: 0,
            airportsDone: 0,
            pilotsTotal: 0,
            pilotsDone: 0,
            startedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            errorMessage: null,
          },
    };
  });

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


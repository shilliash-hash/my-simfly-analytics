// Server-only flight ingestion. This is the SINGLE implementation of "pull the
// pilot's freshest logbook page into `simfly_flights` and reconcile aircraft
// cooldowns". It is called from two places:
//
//   1. `getSimflyPayload` (Hub load) — fire-and-forget, with the assets/page-1
//      payloads it already fetched, so the dashboard costs no extra requests.
//   2. `/api/public/hooks/sync-tick` (pg_cron worker) — awaited, so ingestion
//      no longer depends on anyone opening the Hub.
//
// Filename ends in `.server.ts` so it can never reach the client bundle.

const SIMFLY_BASE = "https://simfly.io/api";
const FETCH_TIMEOUT_MS = 12_000;

type AssetItem = {
  type?: string;
  aircraftId?: string | number;
  timers?: { inGroundOperationUntil?: string | null };
};
type AssetsAll = { items?: AssetItem[] };
type FlightLite = { id?: string; aircraftId?: string | number };
type FlightsPage = { flights?: FlightLite[] };

async function fetchJSON<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export type IngestResult = {
  username: string;
  imported: number;
  reconciled: number;
  latestFlightAt: string | null;
};

/**
 * Ingest the pilot's page-1 logbook and reconcile aircraft cooldowns.
 *
 * @param username SimFly username the flights belong to.
 * @param nonce    Matching SimFly nonce.
 * @param opts     Optionally pass already-fetched `assets` / `page1` payloads
 *                 to avoid duplicate SimFly requests.
 */
export async function ingestPilotFlights(
  username: string,
  nonce: string,
  opts?: { assets?: unknown; page1?: unknown },
): Promise<IngestResult> {
  const qs = `username=${encodeURIComponent(username)}&nonce=${encodeURIComponent(nonce)}`;

  const [assets, p1] = await Promise.all([
    opts?.assets !== undefined
      ? Promise.resolve(opts.assets as AssetsAll | null)
      : fetchJSON<AssetsAll>(`${SIMFLY_BASE}/user/assets/all?${qs}`),
    opts?.page1 !== undefined
      ? Promise.resolve(opts.page1 as FlightsPage | null)
      : fetchJSON<FlightsPage>(`${SIMFLY_BASE}/user/flights?${qs}&fpage=1`),
  ]);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { flightToRow, sanitiseFlightRowForDb } = await import("./backfill.functions");

  // Snapshot each owned aircraft's live post-flight cooldown so historical
  // utilization can distinguish "grounded" from "idle". Cooldown is an
  // AIRCRAFT property, not a pilot property — the map is keyed on aircraft_id
  // and applied regardless of who flew the tail.
  const groundedByAircraftId = new Map<string, string>();
  for (const it of assets?.items ?? []) {
    if (it.type === "Airplane") {
      const gu = it.timers?.inGroundOperationUntil ?? null;
      if (it.aircraftId && gu) groundedByAircraftId.set(String(it.aircraftId), gu);
    }
  }

  let imported = 0;
  let latestFlightAt: string | null = null;

  if (p1?.flights?.length) {
    const total = p1.flights.length;
    const fresh = p1.flights.map((f, index) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const row = sanitiseFlightRowForDb(flightToRow(username, f as any, { page: 1, index, total }), username);
      const aid = f.aircraftId ? String(f.aircraftId) : null;
      const gu = aid ? groundedByAircraftId.get(aid) : undefined;
      // Only write when the snapshot actually knows the cooldown. Never
      // overwrite an unknown with an explicit NULL.
      if (gu) row.grounded_until = gu;
      else delete (row as Record<string, unknown>).grounded_until;
      const ts = (row as Record<string, unknown>).mission_start_ts;
      if (typeof ts === "string" && (!latestFlightAt || ts > latestFlightAt)) latestFlightAt = ts;
      return row;
    });

    const { error, data } = await supabaseAdmin
      .from("simfly_flights")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert(fresh as any, { onConflict: "username,flight_id", ignoreDuplicates: true })
      .select("flight_id");
    if (error) console.warn("[simfly-sync] page-1 upsert failed", error.message);
    imported = data?.length ?? 0;
  }

  // Aircraft-keyed cooldown reconciliation.
  // LastFlightOnTail → aircraft snapshot → fill grounded_until.
  // The owner's session is the only one that can see its tails' live timers,
  // so it repairs rows imported by ANY pilot who flew an owned aircraft.
  // Strictly bounded so a live timer can never be attributed to an older
  // flight: only the tail's single most recent flight is eligible, the timer
  // must still be running, and it must start at that flight's end.
  let reconciled = 0;
  const nowMs = Date.now();
  for (const [aircraftId, guIso] of groundedByAircraftId) {
    try {
      const guMs = Date.parse(guIso);
      // Timer must be live — an expired timer says nothing about which flight
      // it belonged to.
      if (!Number.isFinite(guMs) || guMs <= nowMs) continue;

      // The tail's most recent flight, whoever flew it. NOT "most recent row
      // missing grounded_until" — that would walk backwards through history on
      // repeat runs and stamp old flights with this timer.
      const { data: candidate } = await supabaseAdmin
        .from("simfly_flights")
        .select("username, flight_id, mission_start_ts, flight_time, grounded_until")
        .eq("aircraft_id", aircraftId)
        .order("mission_start_ts", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!candidate?.flight_id || !candidate.mission_start_ts) continue;
      if (candidate.grounded_until) continue; // already observed — never overwrite

      const startMs = Date.parse(candidate.mission_start_ts);
      if (!Number.isFinite(startMs)) continue;
      const parts = String(candidate.flight_time ?? "").split(":").map(Number);
      const mins = parts.length === 3 && parts.every(Number.isFinite)
        ? parts[0] * 60 + parts[1] + parts[2] / 60
        : 0;
      const endMs = startMs + mins * 60_000;
      // Cooldown runs from touchdown and is already underway: it must end in
      // the future but cannot have started more than 24h ago.
      if (endMs >= guMs) continue;
      if (endMs < nowMs - 86_400_000) continue;

      const { error } = await supabaseAdmin
        .from("simfly_flights")
        .update({ grounded_until: guIso })
        .eq("username", candidate.username)
        .eq("flight_id", candidate.flight_id)
        .is("grounded_until", null);
      if (error) console.warn("[simfly-sync] grounded reconcile failed", aircraftId, error.message);
      else reconciled += 1;
    } catch (err) {
      console.warn(
        "[simfly-sync] grounded reconcile error",
        aircraftId,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  return { username, imported, reconciled, latestFlightAt };
}

/** Register a pilot in the background-sync rotation (idempotent, best effort). */
export async function registerPilotForSync(username: string): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("pilot_sync_state")
      .upsert({ username }, { onConflict: "username", ignoreDuplicates: true });
  } catch (err) {
    console.warn(
      "[simfly-sync] registerPilotForSync failed",
      username,
      err instanceof Error ? err.message : String(err),
    );
  }
}

const BASE_INTERVAL_MS = 5 * 60_000;
const IDLE_INTERVAL_MS = 60 * 60_000;
const BACKOFF_MS = [5 * 60_000, 15 * 60_000, 60 * 60_000];

type SyncRow = {
  username: string;
  consecutive_failures: number | null;
  last_flight_at: string | null;
};

export type TickPilotResult = {
  username: string;
  imported: number;
  reconciled?: number;
  error?: string;
};

/**
One scheduler slice.
 *
 * Phase A (asset watch, optional): probe Hub-owned airports and aircraft for
 * new activity. Any pilot seen on a Hub asset — including pilots who never use
 * the Hub — is registered and marked due immediately.
 *
 * Phase B (unchanged): pick the pilots that are due, ingest each with the
 * shared helper, and record the outcome. Failures are isolated per pilot, and
 * the timer-based interval remains the safety net if the probe fails.
 */
export async function runSyncTick(opts?: {
  batch?: number;
  budgetMs?: number;
  probe?: boolean;
  probeBudgetMs?: number;
}): Promise<{
  processed: number;
  imported: number;
  failed: number;
  skipped: number;
  durationMs: number;
  pilots: TickPilotResult[];
  probe?: import("./asset-watch.server").ProbeResult;
}> {
  const started = Date.now();
  const batch = Math.max(1, Math.min(50, opts?.batch ?? 15));
  const budgetMs = opts?.budgetMs ?? 15_000;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { getSessionIdentity } = await import("./identity.server");

    // Phase A — asset activity watch. Never allowed to abort the tick.
  let probeResult: import("./asset-watch.server").ProbeResult | undefined;
  if (opts?.probe !== false) {
    try {
      const { probeAssets, applyProbeEvidence } = await import("./asset-watch.server");
      probeResult = await probeAssets({ budgetMs: opts?.probeBudgetMs ?? 10_000 });
      await applyProbeEvidence(probeResult);
    } catch (err) {
      console.warn(
        "[simfly-sync] asset probe failed",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  // Phase B — ingestion. Its budget is measured from here so a slow probe
  // never eats the ingestion window.
  const ingestStarted = Date.now();

  const { data: due } = await supabaseAdmin
    .from("pilot_sync_state")
    .select("username, consecutive_failures, last_flight_at")
    .eq("enabled", true)
    .lte("next_sync_after", new Date().toISOString())
    .order("next_sync_after", { ascending: true })
    .limit(batch);

  const rows = (due ?? []) as SyncRow[];
  const pilots: TickPilotResult[] = [];
  let skipped = 0;

  const queue = [...rows];
  const worker = async () => {
    for (;;) {
      const row = queue.shift();
      if (!row) return;
       if (Date.now() - ingestStarted > budgetMs) {
         
        skipped += 1;
        continue;
      }
      try {
        const { nonce } = await getSessionIdentity({ username: row.username });
        const res = await ingestPilotFlights(row.username, nonce);
        const idle =
          res.latestFlightAt == null
            ? row.last_flight_at == null
            : Date.now() - Date.parse(res.latestFlightAt) > 7 * 86_400_000;
        const nextMs = idle ? IDLE_INTERVAL_MS : BASE_INTERVAL_MS;
        await supabaseAdmin
          .from("pilot_sync_state")
          .update({
            last_synced_at: new Date().toISOString(),
            next_sync_after: new Date(Date.now() + nextMs).toISOString(),
            last_imported_count: res.imported,
            last_flight_at: res.latestFlightAt ?? row.last_flight_at,
            consecutive_failures: 0,
            last_error: null,
          })
          .eq("username", row.username);
        pilots.push({ username: row.username, imported: res.imported, reconciled: res.reconciled });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const failures = (row.consecutive_failures ?? 0) + 1;
        const delay = BACKOFF_MS[Math.min(failures - 1, BACKOFF_MS.length - 1)];
        await supabaseAdmin
          .from("pilot_sync_state")
          .update({
            next_sync_after: new Date(Date.now() + delay).toISOString(),
            consecutive_failures: failures,
            last_error: message.slice(0, 500),
          })
          .eq("username", row.username);
        pilots.push({ username: row.username, imported: 0, error: message });
      }
    }
  };

  await Promise.allSettled([worker(), worker(), worker()]);

  const failed = pilots.filter((p) => p.error).length;
  const result = {
    processed: pilots.length,
    imported: pilots.reduce((s, p) => s + p.imported, 0),
    failed,
    skipped,
    durationMs: Date.now() - started,
    pilots,
   ...(probeResult ? { probe: probeResult } : {}),
  };
  
  console.log("[simfly-sync] tick", JSON.stringify(result));
  return result;
}

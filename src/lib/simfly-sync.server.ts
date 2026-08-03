// Server-only flight ingestion + SESSION CATCH-UP.
//
// Synchronisation is session-driven: there is no scheduler and no cron. When a
// Hub user opens the Hub, `runSessionCatchUp` probes that user's own assets for
// movements by ANY pilot (including pilots who never use the Hub), ingests the
// pilots involved, then refreshes the user's own logbook and reconciles
// aircraft cooldowns.
//
// `ingestPilotFlights` remains the SINGLE implementation of "pull a pilot's
// freshest logbook page into `simfly_flights` and reconcile aircraft cooldowns".
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

/** Record that a pilot has been seen by the Hub (idempotent, best effort). */
export async function recordPilotSeen(username: string): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("pilot_sync_state")
      .upsert({ username }, { onConflict: "username", ignoreDuplicates: true });
  } catch (err) {
    console.warn(
      "[simfly-sync] recordPilotSeen failed",
      username,
      err instanceof Error ? err.message : String(err),
    );
  }
}

/** Don't re-run a catch-up more often than this for the same pilot. */
export const CATCH_UP_COOLDOWN_MS = 3 * 60_000;
/** Max third-party pilots ingested in one catch-up. */
const MAX_DISCOVERED_PILOTS = 12;
/** Concurrency for third-party logbook ingestion. */
const PILOT_CONCURRENCY = 3;

export type CatchUpResult = {
  username: string;
  ran: boolean;
  reason?: string;
  imported: number;
  reconciled: number;
  pilotsSynced: number;
  assetsProbed: number;
  assetsChanged: number;
  durationMs: number;
};

/**
 * SESSION CATCH-UP — the only synchronisation path.
 *
 * Runs when a Hub user opens the Hub. Everything a user's dashboards read is
 * reachable from that user's own assets, so probing them covers 100% of what
 * they will look at — no scheduler needed.
 *
 * Phase 1: probe the owner's airports (arrivals AND departures) and aircraft
 *          against stored watermarks.
 * Phase 2: ingest the logbook of every pilot seen on a changed asset, including
 *          pilots who have never used the Hub.
 * Phase 3: ingest the owner's own logbook and reconcile aircraft cooldowns.
 *
 * Every phase is failure-isolated: a phase that throws is logged and the rest
 * still runs.
 */
export async function runSessionCatchUp(
  username: string,
  nonce: string,
  opts?: { assets?: unknown; page1?: unknown; force?: boolean; budgetMs?: number },
): Promise<CatchUpResult> {
  const started = Date.now();
  const budgetMs = opts?.budgetMs ?? 25_000;
  const base: CatchUpResult = {
    username,
    ran: false,
    imported: 0,
    reconciled: 0,
    pilotsSynced: 0,
    assetsProbed: 0,
    assetsChanged: 0,
    durationMs: 0,
  };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Cooldown gate — reopening pages must not re-run the whole catch-up.
  if (!opts?.force) {
    const { data: state } = await supabaseAdmin
      .from("pilot_sync_state")
      .select("last_synced_at")
      .eq("username", username)
      .maybeSingle();
    const last = (state as { last_synced_at: string | null } | null)?.last_synced_at;
    if (last && Date.now() - Date.parse(last) < CATCH_UP_COOLDOWN_MS) {
      return { ...base, reason: "cooldown", durationMs: Date.now() - started };
    }
  }

  let imported = 0;
  let reconciled = 0;
  let pilotsSynced = 0;
  let assetsProbed = 0;
  let assetsChanged = 0;
  let latestFlightAt: string | null = null;
  const errors: string[] = [];

  // Phase 1 — asset activity watch.
  let activePilots: string[] = [];
  try {
    const { probeOwnerAssets } = await import("./asset-watch.server");
    const probe = await probeOwnerAssets(username, nonce, {
      ...(opts?.assets !== undefined ? { assets: opts.assets } : {}),
      budgetMs: Math.max(5_000, Math.floor(budgetMs * 0.6)),
    });
    assetsProbed = probe.assetsProbed;
    assetsChanged = probe.assetsChanged;
    activePilots = probe.activePilots.filter((p) => p !== username);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(`probe: ${message}`);
    console.warn("[simfly-sync] catch-up probe failed", username, message);
  }

  // Phase 2 — ingest third-party pilots discovered on the owner's assets.
  if (activePilots.length) {
    const { getSessionIdentity } = await import("./identity.server");
    const queue = [...new Set(activePilots)].slice(0, MAX_DISCOVERED_PILOTS);

    const worker = async () => {
      for (;;) {
        const pilot = queue.shift();
        if (!pilot) return;
        if (Date.now() - started > budgetMs) return;
        try {
          await recordPilotSeen(pilot);
          const { nonce: pilotNonce } = await getSessionIdentity({ username: pilot });
          const res = await ingestPilotFlights(pilot, pilotNonce);
          imported += res.imported;
          reconciled += res.reconciled;
          pilotsSynced += 1;
          await supabaseAdmin
            .from("pilot_sync_state")
            .update({
              last_synced_at: new Date().toISOString(),
              last_imported_count: res.imported,
              last_flight_at: res.latestFlightAt,
              last_error: null,
            })
            .eq("username", pilot);
        } catch (err) {
          // A pilot we cannot resolve is normal (no nonce discoverable).
          console.warn(
            "[simfly-sync] discovered pilot ingest skipped",
            pilot,
            err instanceof Error ? err.message : String(err),
          );
        }
      }
    };

    await Promise.allSettled(Array.from({ length: PILOT_CONCURRENCY }, () => worker()));
  }

  // Phase 3 — the session user's own logbook + cooldown reconciliation.
  try {
    const res = await ingestPilotFlights(username, nonce, {
      ...(opts?.assets !== undefined ? { assets: opts.assets } : {}),
      ...(opts?.page1 !== undefined ? { page1: opts.page1 } : {}),
    });
    imported += res.imported;
    reconciled += res.reconciled;
    latestFlightAt = res.latestFlightAt;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(`self: ${message}`);
    console.warn("[simfly-sync] catch-up self-ingest failed", username, message);
  }

  await supabaseAdmin.from("pilot_sync_state").upsert(
    {
      username,
      last_synced_at: new Date().toISOString(),
      last_imported_count: imported,
      ...(latestFlightAt ? { last_flight_at: latestFlightAt } : {}),
      last_error: errors.length ? errors.join(" | ").slice(0, 500) : null,
    },
    { onConflict: "username" },
  );

  const result: CatchUpResult = {
    username,
    ran: true,
    imported,
    reconciled,
    pilotsSynced,
    assetsProbed,
    assetsChanged,
    durationMs: Date.now() - started,
    ...(errors.length ? { reason: errors.join(" | ") } : {}),
  };
  console.log("[simfly-sync] catch-up", JSON.stringify(result));
  return result;
}


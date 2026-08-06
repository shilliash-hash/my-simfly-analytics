// Aircraft ownership history — append-only ledger.
//
// SimFly aircraft can change owner while keeping the same aircraft ID. The Hub
// therefore cannot use the LIVE asset snapshot to decide who owned a tail when
// a historical flight happened. This module records ownership PERIODS and
// exposes a resolver every analytics module can use to ask
// "did <user> own <aircraft> at <time>?".
//
// IMMUTABILITY: periods are audit records. A transfer only ever INSERTS a new
// period. Closed periods are never modified, merged or deleted. The single
// permitted mutation is setting `ended_at` on a still-open period, and only
// while no later period exists for that aircraft.
//
// Filename ends in `.server.ts` so it can never reach the client bundle.

export type OwnershipPeriod = {
  id: string;
  aircraftId: string;
  ownerUsername: string;
  startedAtIso: string;
  endedAtIso: string | null;
  startInferred: boolean;
};

export type OwnershipWindow = {
  aircraftId: string;
  fromMs: number;
  /** null = still owned */
  toMs: number | null;
  inferred: boolean;
};

export type OwnershipView = {
  windows: OwnershipWindow[];
  /** Every aircraft the user owns now or has ever owned (per the ledger). */
  aircraftIds: string[];
  /** True when the ledger had no rows and we fell back to the live snapshot. */
  fallback: boolean;
};

function norm(u: string): string {
  return (u || "").trim().toLowerCase();
}

/** All periods for a user, newest first. Read-only. */
export async function getOwnershipPeriods(username: string): Promise<OwnershipPeriod[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("aircraft_ownership_period")
    .select("id, aircraft_id, owner_username, started_at, ended_at, start_inferred")
    .eq("owner_username", norm(username))
    .order("started_at", { ascending: false });
  if (error) {
    console.warn("[ownership] read failed", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: r.id as string,
    aircraftId: r.aircraft_id as string,
    ownerUsername: r.owner_username as string,
    startedAtIso: r.started_at as string,
    endedAtIso: (r.ended_at as string | null) ?? null,
    startInferred: !!r.start_inferred,
  }));
}

/** Every period recorded for one aircraft (audit trail), oldest first. */
export async function getAircraftOwnershipTrail(aircraftId: string): Promise<OwnershipPeriod[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("aircraft_ownership_period")
    .select("id, aircraft_id, owner_username, started_at, ended_at, start_inferred")
    .eq("aircraft_id", aircraftId)
    .order("started_at", { ascending: true });
  if (error) return [];
  return (data ?? []).map((r) => ({
    id: r.id as string,
    aircraftId: r.aircraft_id as string,
    ownerUsername: r.owner_username as string,
    startedAtIso: r.started_at as string,
    endedAtIso: (r.ended_at as string | null) ?? null,
    startInferred: !!r.start_inferred,
  }));
}

/**
 * Ownership windows for a user.
 *
 * @param liveAircraftIds aircraft currently in the user's SimFly snapshot —
 *        used ONLY as a fallback while the ledger is still empty for this
 *        user, so behaviour before the ledger fills is unchanged.
 */
export async function getOwnedAircraftWindows(
  username: string,
  liveAircraftIds: string[] = [],
): Promise<OwnershipView> {
  const periods = await getOwnershipPeriods(username);
  if (periods.length === 0) {
    const ids = Array.from(new Set(liveAircraftIds.filter(Boolean)));
    return {
      windows: ids.map((aircraftId) => ({ aircraftId, fromMs: -Infinity, toMs: null, inferred: true })),
      aircraftIds: ids,
      fallback: true,
    };
  }
  const windows: OwnershipWindow[] = periods.map((p) => ({
    aircraftId: p.aircraftId,
    fromMs: Date.parse(p.startedAtIso),
    toMs: p.endedAtIso ? Date.parse(p.endedAtIso) : null,
    inferred: p.startInferred,
  }));
  // Live snapshot aircraft the ledger hasn't seen yet (first session after a
  // purchase, before reconciliation runs) still count as owned from now on.
  const known = new Set(windows.map((w) => w.aircraftId));
  for (const id of liveAircraftIds) {
    if (id && !known.has(id)) {
      known.add(id);
      windows.push({ aircraftId: id, fromMs: -Infinity, toMs: null, inferred: true });
    }
  }
  return { windows, aircraftIds: Array.from(known), fallback: false };
}

/** Did the window set cover this aircraft at this instant? */
export function ownedAt(windows: OwnershipWindow[], aircraftId: string | null | undefined, tsMs: number): boolean {
  if (!aircraftId || !Number.isFinite(tsMs)) return false;
  for (const w of windows) {
    if (w.aircraftId !== aircraftId) continue;
    if (tsMs < w.fromMs) continue;
    if (w.toMs !== null && tsMs >= w.toMs) continue;
    return true;
  }
  return false;
}

/** Earliest owning-window start for an aircraft (ms), or null. */
export function windowStartFor(windows: OwnershipWindow[], aircraftId: string): number | null {
  let min: number | null = null;
  for (const w of windows) {
    if (w.aircraftId !== aircraftId) continue;
    if (min === null || w.fromMs < min) min = w.fromMs;
  }
  return min;
}

export type OwnershipReconcileResult = { opened: number; closed: number };

/**
 * Reconcile the ledger against one pilot's live asset snapshot.
 *
 * Append-only: opens periods for newly observed aircraft, closes the open
 * period of aircraft that left the snapshot (or moved to another owner).
 * Writes nothing when the snapshot already agrees with the ledger.
 */
export async function reconcileOwnershipFromSnapshot(
  username: string,
  observedAircraftIds: string[],
): Promise<OwnershipReconcileResult> {
  const owner = norm(username);
  if (!owner) return { opened: 0, closed: 0 };
  const observed = Array.from(new Set(observedAircraftIds.filter(Boolean)));

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Everything we might need to touch: this user's periods + any period on an
  // observed aircraft (possibly still open under the previous owner).
  const [mine, onObserved] = await Promise.all([
    supabaseAdmin
      .from("aircraft_ownership_period")
      .select("id, aircraft_id, owner_username, started_at, ended_at")
      .eq("owner_username", owner),
    observed.length
      ? supabaseAdmin
          .from("aircraft_ownership_period")
          .select("id, aircraft_id, owner_username, started_at, ended_at")
          .in("aircraft_id", observed)
      : Promise.resolve({ data: [], error: null } as const),
  ]);

  if (mine.error) {
    console.warn("[ownership] reconcile read failed", mine.error.message);
    return { opened: 0, closed: 0 };
  }
  type Row = {
    id: string;
    aircraft_id: string;
    owner_username: string;
    started_at: string;
    ended_at: string | null;
  };
  const rows = new Map<string, Row>();
  for (const r of [...(mine.data ?? []), ...((onObserved as { data?: Row[] }).data ?? [])] as Row[]) {
    rows.set(r.id, r);
  }
  const all = Array.from(rows.values());

  const nowIso = new Date().toISOString();
  let opened = 0;
  let closed = 0;

  const openByAircraft = new Map<string, Row>();
  const anyByAircraft = new Map<string, Row[]>();
  for (const r of all) {
    if (!r.ended_at) openByAircraft.set(r.aircraft_id, r);
    const list = anyByAircraft.get(r.aircraft_id) ?? [];
    list.push(r);
    anyByAircraft.set(r.aircraft_id, list);
  }

  // 1. Aircraft in the snapshot that the ledger doesn't credit to this user.
  for (const aircraftId of observed) {
    const open = openByAircraft.get(aircraftId);
    if (open && norm(open.owner_username) === owner) continue; // already correct

    let startIso = nowIso;
    let inferred = false;

    if (open) {
      // Transfer: close the previous owner's period at the boundary just after
      // their last flight on this tail (never before it, never in the future).
      const { data: lastFlight } = await supabaseAdmin
        .from("simfly_flights")
        .select("mission_start_ts")
        .eq("aircraft_id", aircraftId)
        .eq("username", open.owner_username)
        .gte("mission_start_ts", open.started_at)
        .order("mission_start_ts", { ascending: false })
        .limit(1)
        .maybeSingle();
      const lastMs = lastFlight?.mission_start_ts ? Date.parse(lastFlight.mission_start_ts) : NaN;
      const boundaryMs = Number.isFinite(lastMs)
        ? Math.min(Date.now(), lastMs + 1000)
        : Date.now();
      const boundaryIso = new Date(Math.max(boundaryMs, Date.parse(open.started_at) + 1000)).toISOString();
      const { error } = await supabaseAdmin
        .from("aircraft_ownership_period")
        .update({ ended_at: boundaryIso })
        .eq("id", open.id)
        .is("ended_at", null);
      if (error) {
        console.warn("[ownership] close on transfer failed", aircraftId, error.message);
        continue;
      }
      closed += 1;
      startIso = boundaryIso;
    } else if (!anyByAircraft.has(aircraftId)) {
      // First time the Hub has ever seen this aircraft: assume the current
      // owner held it for its whole known history and mark the start inferred.
      const { data: firstFlight } = await supabaseAdmin
        .from("simfly_flights")
        .select("mission_start_ts")
        .eq("aircraft_id", aircraftId)
        .order("mission_start_ts", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (firstFlight?.mission_start_ts) {
        startIso = firstFlight.mission_start_ts;
        inferred = true;
      }
    }
    // else: the aircraft has closed periods but no open one (previously sold
    // away and now re-acquired) → new period starts now.

    const { error: insErr } = await supabaseAdmin
      .from("aircraft_ownership_period")
      .insert({
        aircraft_id: aircraftId,
        owner_username: owner,
        started_at: startIso,
        start_inferred: inferred,
      });
    if (insErr) console.warn("[ownership] open period failed", aircraftId, insErr.message);
    else opened += 1;
  }

  // 2. Open periods of this user whose aircraft left the snapshot → sold.
  const observedSet = new Set(observed);
  for (const r of all) {
    if (r.ended_at) continue;
    if (norm(r.owner_username) !== owner) continue;
    if (observedSet.has(r.aircraft_id)) continue;
    const endIso = new Date(Math.max(Date.now(), Date.parse(r.started_at) + 1000)).toISOString();
    const { error } = await supabaseAdmin
      .from("aircraft_ownership_period")
      .update({ ended_at: endIso })
      .eq("id", r.id)
      .is("ended_at", null);
    if (error) console.warn("[ownership] close on sale failed", r.aircraft_id, error.message);
    else closed += 1;
  }

  return { opened, closed };
}

import { createServerFn } from "@tanstack/react-start";

// SimFly week epoch (Monday 2022-08-15 UTC) — must match the boundary used by
// getAirportUtilizationTimeline. Constants only; no accounting logic here.
const SIMFLY_WEEK_EPOCH_MS = Date.UTC(2022, 7, 15, 0, 0, 0);
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

function weekStartUtcMs(tsMs: number): number {
  const d = new Date(tsMs);
  const day = d.getUTCDay();
  const mondayOffset = (day + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - mondayOffset);
}
function simflyWeekNumber(weekStartMs: number): number {
  return Math.max(1, Math.round((weekStartMs - SIMFLY_WEEK_EPOCH_MS) / MS_PER_WEEK) + 1);
}

/** Parse "HH:MM:SS" (SimFly flight_time) → minutes. Returns null on garbage. */
function parseFlightMinutes(ft: string | null | undefined): number | null {
  if (!ft || typeof ft !== "string") return null;
  const s = ft.trim();
  if (!s || s === "0" || s === "00:00:00") return null;
  const parts = s.split(":").map((p) => Number(p));
  if (parts.some((n) => !Number.isFinite(n))) return null;
  let h = 0, m = 0, sec = 0;
  if (parts.length === 3) [h, m, sec] = parts;
  else if (parts.length === 2) [m, sec] = parts;
  else if (parts.length === 1) [m] = parts;
  const total = h * 60 + m + sec / 60;
  return total > 0 ? total : null;
}

export type AircraftWeekCell = {
  activeMinutes: number;
  groundedMinutes: number;
  /** Whether grounded evidence was available for this week (rows carried grounded_until). */
  hasGroundedEvidence: boolean;
  flights: number;
  pax: number;
  income: number;
  /** Flight Activity: calendar-based = active / observed week minutes */
  flightActivity: number;
  /** Operational Utilization: active / (observed - grounded), null when no grounded evidence */
  operationalUtilization: number | null;
} | null;

export type AircraftInfo = {
  aircraftId: string;
  name: string;
  icao: string;
  tailNumber: string;
};

export type AircraftUtilizationWeek = {
  weekStartIso: string;
  weekNumber: number;
  isCurrent: boolean;
  observedMinutes: number;
};

export type AircraftUtilizationTimeline = {
  weeks: AircraftUtilizationWeek[];
  aircraft: AircraftInfo[];
  /** cells[aircraftId][weekStartIso] — null when no evidence for that week */
  cells: Record<string, Record<string, AircraftWeekCell>>;
  fleet: Record<
    string,
    { fleetFlightActivity: number; fleetOperational: number | null; activeAircraft: number; rotations: number }
  >;
  fetchedAt: string;
};

export const getAircraftUtilizationTimeline = createServerFn({ method: "GET" })
  .inputValidator((d?: { username?: string; weeks?: number }) => d ?? {})
  .handler(async ({ data }): Promise<AircraftUtilizationTimeline> => {
    const { getSessionIdentity } = await import("./identity.server");
    const identity = await getSessionIdentity({ username: data.username });
    const username = identity.username;
    const weeksBack = Math.min(Math.max(data.weeks ?? 26, 4), 52);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Resolve owned aircraft IDs for the viewed pilot. Attribution is
    // owner-based: any flight using one of these tails counts, regardless of
    // which pilot operated it.
    const { getSimflyPayload } = await import("./simfly.functions");
    const payload = await getSimflyPayload({ data: { username } });
    const ownedAircraft = payload.airplanes.map((a) => ({
      aircraftId: a.aircraftId,
      name: a.name,
      icao: a.icao,
      tailNumber: a.tailNumber ?? "",
    }));
    const ownedIds = ownedAircraft.map((a) => a.aircraftId).filter(Boolean);

    const now = Date.now();
    const currentWeekStart = weekStartUtcMs(now);
    const earliestWeekStart = currentWeekStart - (weeksBack - 1) * MS_PER_WEEK;

    // Empty ownership → return empty scaffolding without hitting DB.
    if (ownedIds.length === 0) {
      const weeksOnly: AircraftUtilizationWeek[] = [];
      for (let ws = earliestWeekStart; ws <= currentWeekStart; ws += MS_PER_WEEK) {
        const isCurrent = ws === currentWeekStart;
        weeksOnly.push({
          weekStartIso: new Date(ws).toISOString(),
          weekNumber: simflyWeekNumber(ws),
          isCurrent,
          observedMinutes: isCurrent ? Math.max(1, Math.floor((now - ws) / 60000)) : 10080,
        });
      }
      return { weeks: weeksOnly, aircraft: [], cells: {}, fleet: {}, fetchedAt: new Date().toISOString() };
    }

    // Attribution: owner-based via aircraft_id. NO username filter — visitors,
    // renters, and any pilot operating an owned tail all count.
    const { data: rowsRaw, error } = await supabaseAdmin
      .from("simfly_flights")
      .select(
        "flight_id, aircraft_id, aircraft, aircraft_icao, aircraft_tail_number, mission_start_ts, flight_time, pax, total_reward, grounded_until",
      )
      .in("aircraft_id", ownedIds)
      .gte("mission_start_ts", new Date(earliestWeekStart).toISOString())
      .order("mission_start_ts", { ascending: true });

    if (error) throw new Error(`Aircraft utilization query failed: ${error.message}`);

    const rows = rowsRaw ?? [];

    // Build weeks list (oldest → newest, always fixed length).
    const weeks: AircraftUtilizationWeek[] = [];
    for (let ws = earliestWeekStart; ws <= currentWeekStart; ws += MS_PER_WEEK) {
      const isCurrent = ws === currentWeekStart;
      const observedMinutes = isCurrent
        ? Math.max(1, Math.floor((now - ws) / 60000))
        : 10080;
      weeks.push({
        weekStartIso: new Date(ws).toISOString(),
        weekNumber: simflyWeekNumber(ws),
        isCurrent,
        observedMinutes,
      });
    }

    // Seed aircraftInfo with owned aircraft (so table shows even tails w/ no flights).
    const aircraftInfo = new Map<string, AircraftInfo>();
    for (const a of ownedAircraft) aircraftInfo.set(a.aircraftId, a);

    type Bucket = {
      activeMinutes: number;
      groundedMinutes: number;
      hasGroundedEvidence: boolean;
      flights: number;
      pax: number;
      income: number;
    };
    const buckets = new Map<string, Map<string, Bucket>>();

    for (const r of rows) {
      const aid = r.aircraft_id;
      if (!aid) continue;
      const ts = r.mission_start_ts ? Date.parse(r.mission_start_ts) : NaN;
      if (!Number.isFinite(ts)) continue;
      const ws = weekStartUtcMs(ts);
      if (ws < earliestWeekStart || ws > currentWeekStart) continue;

      // Enrich aircraftInfo from flights when we don't already know a tail
      // (e.g. aircraft since sold).
      if (!aircraftInfo.has(aid)) {
        aircraftInfo.set(aid, {
          aircraftId: aid,
          name: r.aircraft ?? "",
          icao: r.aircraft_icao ?? "",
          tailNumber: r.aircraft_tail_number ?? "",
        });
      }
      const wsIso = new Date(ws).toISOString();
      let byWeek = buckets.get(aid);
      if (!byWeek) { byWeek = new Map(); buckets.set(aid, byWeek); }
      let cell = byWeek.get(wsIso);
      if (!cell) {
        cell = { activeMinutes: 0, groundedMinutes: 0, hasGroundedEvidence: false, flights: 0, pax: 0, income: 0 };
        byWeek.set(wsIso, cell);
      }

      const mins = parseFlightMinutes(r.flight_time) ?? 0;
      cell.activeMinutes += mins;
      cell.flights += 1;
      cell.pax += Number(r.pax ?? 0) || 0;
      cell.income += Number(r.total_reward ?? 0) || 0;

      // Grounded evidence: post-flight cooldown snapshotted at write time.
      // Historical rows without a snapshot leave the cell as partial evidence.
      const guRaw = (r as { grounded_until?: string | null }).grounded_until;
      if (guRaw) {
        const guMs = Date.parse(guRaw);
        if (Number.isFinite(guMs) && guMs > ts) {
          const weekEnd = ws + MS_PER_WEEK;
          // Grounded span clipped to this week.
          const spanEnd = Math.min(guMs, weekEnd);
          const spanStart = Math.max(ts + mins * 60_000, ws);
          const groundedInWeek = Math.max(0, (spanEnd - spanStart) / 60_000);
          cell.groundedMinutes += groundedInWeek;
        }
        cell.hasGroundedEvidence = true;
      }
    }

    // Ownership horizon = earliest flight seen. Prior weeks stay null (missing ≠ zero).
    const firstSeenWeek = new Map<string, string>();
    for (const [aid, byWeek] of buckets) {
      let firstIso: string | null = null;
      let firstMs = Infinity;
      for (const iso of byWeek.keys()) {
        const m = Date.parse(iso);
        if (m < firstMs) { firstMs = m; firstIso = iso; }
      }
      if (firstIso) firstSeenWeek.set(aid, firstIso);
    }

    const cellsOut: Record<string, Record<string, AircraftWeekCell>> = {};
    for (const aid of aircraftInfo.keys()) {
      const byWeek = buckets.get(aid);
      const firstIso = firstSeenWeek.get(aid);
      const firstMs = firstIso ? Date.parse(firstIso) : (byWeek ? Infinity : -Infinity);
      // If no flight rows for this owned aircraft at all, treat every week
      // in-window as zero-activity (evidence: we know it's owned now).
      const perWeek: Record<string, AircraftWeekCell> = {};
      for (const w of weeks) {
        const wsMs = Date.parse(w.weekStartIso);
        if (byWeek && wsMs < firstMs) { perWeek[w.weekStartIso] = null; continue; }
        const cell = byWeek?.get(w.weekStartIso);
        if (!cell) {
          perWeek[w.weekStartIso] = {
            activeMinutes: 0, groundedMinutes: 0, hasGroundedEvidence: false,
            flights: 0, pax: 0, income: 0,
            flightActivity: 0, operationalUtilization: null,
          };
        } else {
          const available = Math.max(1, w.observedMinutes - cell.groundedMinutes);
          perWeek[w.weekStartIso] = {
            activeMinutes: cell.activeMinutes,
            groundedMinutes: cell.groundedMinutes,
            hasGroundedEvidence: cell.hasGroundedEvidence,
            flights: cell.flights,
            pax: cell.pax,
            income: cell.income,
            flightActivity: Math.min(1, cell.activeMinutes / w.observedMinutes),
            operationalUtilization: cell.hasGroundedEvidence
              ? Math.min(1, cell.activeMinutes / available)
              : null,
          };
        }
      }
      cellsOut[aid] = perWeek;
    }

    // Fleet-level rollup per week.
    const fleet: Record<
      string,
      { fleetFlightActivity: number; fleetOperational: number | null; activeAircraft: number; rotations: number }
    > = {};
    for (const w of weeks) {
      let sumFA = 0;
      let observedFA = 0;
      let sumOp = 0;
      let observedOp = 0;
      let active = 0;
      let rotations = 0;
      for (const aid of Object.keys(cellsOut)) {
        const c = cellsOut[aid][w.weekStartIso];
        if (c === null) continue;
        observedFA += 1;
        sumFA += c.flightActivity;
        rotations += c.flights;
        if (c.flights > 0) active += 1;
        if (c.operationalUtilization !== null) {
          observedOp += 1;
          sumOp += c.operationalUtilization;
        }
      }
      fleet[w.weekStartIso] = {
        fleetFlightActivity: observedFA > 0 ? sumFA / observedFA : 0,
        fleetOperational: observedOp > 0 ? sumOp / observedOp : null,
        activeAircraft: active,
        rotations,
      };
    }

    return {
      weeks,
      aircraft: Array.from(aircraftInfo.values()),
      cells: cellsOut,
      fleet,
      fetchedAt: new Date().toISOString(),
    };
  });

/** Pure classifier — trailing 4-week Operational Utilization + current state. */
export type UtilizationClass =
  | "WORKHORSE" | "ACTIVE" | "UNDERUSED" | "IDLE"
  | "GROUNDED" | "AIRBORNE" | "UNKNOWN";
export const UTIL_THRESHOLDS_V1 = {
  workhorse: 0.15,
  active: 0.05,
  underused: 0.02,
} as const;

/**
 * @param trailingOp trailing 4-week Operational Utilization mean (falls back
 *                   to Flight Activity when no grounded evidence).
 * @param trailingFlights trailing 4-week flight count.
 * @param currentState live grounded/airborne flags from the assets snapshot.
 */
export function classifyAircraft(
  trailingOp: number | null,
  trailingFlights: number,
  currentState: { grounded: boolean; airborne: boolean } | null,
): UtilizationClass {
  // Current live state wins for neutral tiers.
  if (currentState?.airborne) return "AIRBORNE";
  if (currentState?.grounded) return "GROUNDED";
    return rateAircraftUtilization(trailingOp, trailingFlights);
}

/** Availability is orthogonal to the statistical rating. */
export type AircraftAvailability = "AIRBORNE" | "GROUNDED" | "READY";

export function aircraftAvailability(
  currentState: { grounded: boolean; airborne: boolean } | null,
): AircraftAvailability {
  if (currentState?.airborne) return "AIRBORNE";
  if (currentState?.grounded) return "GROUNDED";
  return "READY";
}

/** Statistical rating only — never masked by live availability. */
export type UtilizationRating = "WORKHORSE" | "ACTIVE" | "UNDERUSED" | "IDLE" | "UNKNOWN";

export function rateAircraftUtilization(
  trailingOp: number | null,
  trailingFlights: number,
): UtilizationRating {
  if (trailingOp === null) return "UNKNOWN";
  if (trailingOp >= UTIL_THRESHOLDS_V1.workhorse) return "WORKHORSE";
  if (trailingOp >= UTIL_THRESHOLDS_V1.active) return "ACTIVE";
  if (trailingOp >= UTIL_THRESHOLDS_V1.underused) return "UNDERUSED";
  // Only IDLE when trailing activity truly near zero.
  if (trailingFlights === 0) return "IDLE";
  return "UNDERUSED";
}


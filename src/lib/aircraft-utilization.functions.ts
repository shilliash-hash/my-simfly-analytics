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
  flights: number;
  pax: number;
  income: number;
  /** utilization as fraction 0..1 of observed week minutes */
  utilization: number;
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
  /** cells[aircraftId][weekStartIso] — null when aircraft had no rows and no ownership evidence for that week */
  cells: Record<string, Record<string, AircraftWeekCell>>;
  fleet: Record<
    string,
    { fleetUtilization: number; activeAircraft: number; rotations: number }
  >;
  fetchedAt: string;
};

export const getAircraftUtilizationTimeline = createServerFn({ method: "GET" })
  .inputValidator((d?: { username?: string; weeks?: number; aircraftIds?: string[] }) => d ?? {})
  .handler(async ({ data }): Promise<AircraftUtilizationTimeline> => {
    const { getSessionIdentity } = await import("./identity.server");
    const identity = await getSessionIdentity({ username: data.username });
    const username = identity.username;
    const weeksBack = Math.min(Math.max(data.weeks ?? 26, 4), 52);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    
    const now = Date.now();
    const currentWeekStart = weekStartUtcMs(now);
    const earliestWeekStart = currentWeekStart - (weeksBack - 1) * MS_PER_WEEK;

    // 1. POBIERAMY TWOJE SAMOLOTY Z BAZY FLOTY
    const { data: myAircraftsRaw } = await supabaseAdmin
      .from("simfly_aircraft")
      .select("aircraft_id, tail_number, name, aircraft_icao")
      .eq("username", username);

    const aircraftInfo = new Map<string, AircraftInfo>();
    const myAircraftIds: string[] = [];

    if (myAircraftsRaw) {
      for (const a of myAircraftsRaw) {
        if (!a.aircraft_id) continue;
        myAircraftIds.push(a.aircraft_id);
        aircraftInfo.set(a.aircraft_id, {
          aircraftId: a.aircraft_id,
          name: a.name ?? "",
          icao: a.aircraft_icao ?? "",
          tailNumber: a.tail_number ?? "",
        });
      }
    }

    // 2. POBIERAMY REKORDY Z HISTORII AKTYWNOŚCI ZAMIAST TABELI LOTÓW
    // Pobieramy logi powiadomień, gdzie system zapisuje ruch Twoich maszyn (w tym RENTAL)
    const { data: activityRows, error } = await supabaseAdmin
      .from("simfly_activity")
      .select("id, message, at, delta, actor_handle, kind")
      .gte("at", new Date(earliestWeekStart).toISOString())
      .order("at", { ascending: true });

    if (error) throw new Error(`Activity query failed: ${error.message}`);
    const rows = activityRows ?? [];

    // Budowanie osi czasu tygodni
    const weeks: AircraftUtilizationWeek[] = [];
    for (let ws = earliestWeekStart; ws <= currentWeekStart; ws += MS_PER_WEEK) {
      const isCurrent = ws === currentWeekStart;
      const observedMinutes = isCurrent ? Math.max(1, Math.floor((now - ws) / 60000)) : 10080;
      weeks.push({
        weekStartIso: new Date(ws).toISOString(),
        weekNumber: simflyWeekNumber(ws),
        isCurrent,
        observedMinutes,
      });
    }

    const buckets = new Map<string, Map<string, { activeMinutes: number; flights: number; pax: number; income: number; }>>();

    // PARSOWANIE LOGÓW TEKSTOWYCH (Identycznie jak w Activity Feed!)
    for (const r of rows) {
      const msg = (r.message || "").toLowerCase();
      
      // Szukamy, do którego Twojego prawilnego samolotu odnosi się ten log tekstowy
      const matchedAircraft = Array.from(aircraftInfo.values()).find((a) => 
        (a.tailNumber && msg.includes(a.tailNumber.toLowerCase())) || 
        (a.name && msg.includes(a.name.toLowerCase()))
      );

      // Jeśli log nie dotyczy Twojego samolotu — bezwzględnie pomijamy (odsiewa generic)
      if (!matchedAircraft) continue;
      const aid = matchedAircraft.aircraftId;

      const ts = r.at ? Date.parse(r.at) : NaN;
      if (!Number.isFinite(ts)) continue;
      const ws = weekStartUtcMs(ts);
      if (ws < earliestWeekStart || ws > currentWeekStart) continue;

      const wsIso = new Date(ws).toISOString();
      let byWeek = buckets.get(aid);
      if (!byWeek) { byWeek = new Map(); buckets.set(aid, byWeek); }
      let cell = byWeek.get(wsIso);
      if (!cell) { cell = { activeMinutes: 0, flights: 0, pax: 0, income: 0 }; byWeek.set(wsIso, cell); }

      // Wyliczamy minuty lotu i statystyki bezpośrednio z wpisu aktywności
      // Domyślnie przyjmujemy 45 minut jako standardowy czas rotacji dla zapisanego logu
      cell.activeMinutes += 45; 
      cell.flights += 1;
      cell.pax += Number(r.delta || 0) || 0;
      cell.income += 0; // Jeśli masz w bazie kolumnę nagrody, możesz tu podstawić wartość
    }

    const cellsOut: Record<string, Record<string, AircraftWeekCell>> = {};
    for (const aid of aircraftInfo.keys()) {
      const byWeek = buckets.get(aid);
      const perWeek: Record<string, AircraftWeekCell> = {};

      for (const w of weeks) {
        const cell = byWeek?.get(w.weekStartIso);
        if (!cell) {
          perWeek[w.weekStartIso] = { activeMinutes: 0, flights: 0, pax: 0, income: 0, utilization: 0 };
        } else {
          perWeek[w.weekStartIso] = {
            activeMinutes: cell.activeMinutes,
            flights: cell.flights,
            pax: cell.pax,
            income: cell.income,
            utilization: Math.min(1, cell.activeMinutes / w.observedMinutes),
          };
        }
      }
      cellsOut[aid] = perWeek;
    }

    const fleet: Record<string, { fleetUtilization: number; activeAircraft: number; rotations: number }> = {};
    for (const w of weeks) {
      let sumUtil = 0;
      let observed = 0;
      let active = 0;
      let rotations = 0;
      for (const aid of Object.keys(cellsOut)) {
        const c = cellsOut[aid][w.weekStartIso];
        if (c === null) continue;
        observed += 1;
        sumUtil += c.utilization;
        rotations += c.flights;
        if (c.flights > 0) active += 1;
      }
      fleet[w.weekStartIso] = {
        fleetUtilization: observed > 0 ? sumUtil / observed : 0,
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



/** Pure classifier — trailing 4-week mean utilization + current state. */
export type UtilizationClass = "WORKHORSE" | "ACTIVE" | "UNDERUSED" | "IDLE" | "UNKNOWN";
export const UTIL_THRESHOLDS_V1 = {
  workhorse: 0.30,   // ≥ 30% of week actively flying
  active: 0.10,
  underused: 0.02,
} as const;

export function classifyAircraft(
  trailingUtil: number | null,
  trailingFlights: number,
  currentState: { grounded: boolean; airborne: boolean } | null,
): UtilizationClass {
  if (trailingUtil === null) return "UNKNOWN";
  if (trailingUtil >= UTIL_THRESHOLDS_V1.workhorse) return "WORKHORSE";
  if (trailingUtil >= UTIL_THRESHOLDS_V1.active) return "ACTIVE";
  if (trailingUtil >= UTIL_THRESHOLDS_V1.underused) return "UNDERUSED";
  // Post-flight timer ≠ idle: a currently-grounded aircraft with recent
  // flights is not IDLE, just unavailable now.
  if (currentState?.grounded && trailingFlights > 0) return "UNDERUSED";
  if (currentState?.airborne) return "ACTIVE";
  return "IDLE";
}

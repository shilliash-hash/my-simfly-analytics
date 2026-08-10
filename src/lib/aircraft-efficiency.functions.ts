// Aircraft PAX Generation Efficiency Lab — private, read-only analytics.
//
// Answers one question: "How much PAX does this aircraft generate per hour of
// MY OWN flight time?" It reads simfly_flights directly and computes its own
// aggregates. It NEVER touches income, utilization, activity or stats maths.
//
// Scope: flights piloted by the session user only.
//  - Owned fleet  : aircraft owned by the user AT THE TIME of the flight
//                   (aircraft_ownership_period windows).
//  - Generic       : aircraft with no known owner at flight time (SimFly
//                    default aircraft), flown personally.
//  - Rental        : aircraft owned by SOMEONE ELSE at flight time — excluded.
// Zero-PAX / zero-income flights are excluded and counted separately.

import { createServerFn } from "@tanstack/react-start";

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

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

export type EfficiencyConfidence = "HIGH" | "MEDIUM" | "LOW";

export type EfficiencyFlightRef = {
  flightId: string;
  ts: string;
  route: string;
  minutes: number;
  pax: number;
  paxPerHour: number;
};

export type EfficiencyRow = {
  key: string;
  kind: "owned" | "generic";
  name: string;
  registration: string;
  icao: string;
  flights: number;
  minutes: number;
  income: number;
  pax: number;
  paxPerHour: number;
  paxPerMinute: number;
  medianPaxPerHour: number;
  best: EfficiencyFlightRef | null;
  worst: EfficiencyFlightRef | null;
  confidence: EfficiencyConfidence;
};

export type EfficiencyHistogramBin = {
  from: number;
  to: number;
  owned: number;
  generic: number;
};

export type AircraftEfficiencyReport = {
  username: string;
  windowDays: number | null;
  rows: EfficiencyRow[];
  histogram: EfficiencyHistogramBin[];
  overall: {
    flights: number;
    minutes: number;
    pax: number;
    income: number;
    paxPerHour: number;
    medianPaxPerHour: number;
  };
  excluded: {
    zeroIncomeFlights: number;
    zeroPaxFlights: number;
    noDurationFlights: number;
    rentalFlights: number;
  };
  fetchedAt: string;
};

function confidenceOf(n: number): EfficiencyConfidence {
  if (n >= 30) return "HIGH";
  if (n >= 10) return "MEDIUM";
  return "LOW";
}

export const getAircraftEfficiency = createServerFn({ method: "GET" })
  .inputValidator((d?: { username?: string; days?: number }) => d ?? {})
  .handler(async ({ data }): Promise<AircraftEfficiencyReport> => {
    const { getSessionIdentity } = await import("./identity.server");
    const identity = await getSessionIdentity({ username: data.username });
    const username = identity.username;
    const days = data.days && data.days > 0 ? Math.min(data.days, 1095) : null;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let q = supabaseAdmin
      .from("simfly_flights")
      .select(
        "flight_id, aircraft_id, aircraft, aircraft_icao, aircraft_tail_number, mission_start_ts, flight_time, pax, total_reward, departure_icao, destination_icao",
      )
      .eq("username", username)
      .order("mission_start_ts", { ascending: true });
    if (days) {
      q = q.gte("mission_start_ts", new Date(Date.now() - days * 86_400_000).toISOString());
    }
    const { data: rowsRaw, error } = await q;
    if (error) throw new Error(`Aircraft efficiency query failed: ${error.message}`);
    const rows = rowsRaw ?? [];

    // Ownership windows for this pilot (time-bounded).
    const { getSimflyPayload } = await import("./simfly.functions");
    const payload = await getSimflyPayload({ data: { username } });
    const liveIds = payload.airplanes.map((a) => a.aircraftId).filter(Boolean);
    const { getOwnedAircraftWindows, ownedAt } = await import("./aircraft-ownership.server");
    const ownership = await getOwnedAircraftWindows(username, liveIds);

    // Periods held by OTHER pilots — used to detect rentals.
    const flownIds = Array.from(
      new Set(rows.map((r) => r.aircraft_id).filter((x): x is string => !!x)),
    );
    const foreign = new Map<string, { fromMs: number; toMs: number | null }[]>();
    if (flownIds.length > 0) {
      const { data: periods } = await supabaseAdmin
        .from("aircraft_ownership_period")
        .select("aircraft_id, owner_username, started_at, ended_at")
        .in("aircraft_id", flownIds.slice(0, 500));
      for (const p of periods ?? []) {
        if ((p.owner_username ?? "").toLowerCase() === username.toLowerCase()) continue;
        const list = foreign.get(p.aircraft_id) ?? [];
        list.push({
          fromMs: Date.parse(p.started_at),
          toMs: p.ended_at ? Date.parse(p.ended_at) : null,
        });
        foreign.set(p.aircraft_id, list);
      }
    }
    const rentedAt = (aid: string, ts: number) =>
      (foreign.get(aid) ?? []).some((w) => w.fromMs <= ts && (w.toMs === null || w.toMs > ts));

    const liveById = new Map(payload.airplanes.map((a) => [a.aircraftId, a]));

    type Agg = {
      key: string;
      kind: "owned" | "generic";
      name: string;
      registration: string;
      icao: string;
      flights: number;
      minutes: number;
      income: number;
      pax: number;
      rates: number[];
      best: EfficiencyFlightRef | null;
      worst: EfficiencyFlightRef | null;
    };
    const aggs = new Map<string, Agg>();
    const excluded = { zeroIncomeFlights: 0, zeroPaxFlights: 0, noDurationFlights: 0, rentalFlights: 0 };
    const ownedRates: number[] = [];
    const genericRates: number[] = [];

    for (const r of rows) {
      const ts = r.mission_start_ts ? Date.parse(r.mission_start_ts) : NaN;
      if (!Number.isFinite(ts)) continue;
      const aid = r.aircraft_id ?? "";
      const owned = aid ? ownedAt(ownership.windows, aid, ts) : false;
      if (!owned && aid && rentedAt(aid, ts)) {
        excluded.rentalFlights += 1;
        continue;
      }

      const minutes = parseFlightMinutes(r.flight_time);
      if (minutes === null) { excluded.noDurationFlights += 1; continue; }
      const pax = Number(r.pax ?? 0) || 0;
      const income = Number(r.total_reward ?? 0) || 0;
      if (income <= 0) { excluded.zeroIncomeFlights += 1; continue; }
      if (pax <= 0) { excluded.zeroPaxFlights += 1; continue; }

      const live = aid ? liveById.get(aid) : undefined;
      const typeIcao = (r.aircraft_icao || live?.icao || "").toUpperCase();
      const key = owned && aid ? `owned:${aid}` : `generic:${typeIcao || r.aircraft || "unknown"}`;
      let a = aggs.get(key);
      if (!a) {
        a = {
          key,
          kind: owned ? "owned" : "generic",
          name: live?.name || r.aircraft || typeIcao || "Unknown aircraft",
          registration: owned ? (live?.tailNumber || r.aircraft_tail_number || "—") : "Generic",
          icao: typeIcao,
          flights: 0, minutes: 0, income: 0, pax: 0,
          rates: [], best: null, worst: null,
        };
        aggs.set(key, a);
      }
      const paxPerHour = pax / (minutes / 60);
      a.flights += 1;
      a.minutes += minutes;
      a.income += income;
      a.pax += pax;
      a.rates.push(paxPerHour);
      (owned ? ownedRates : genericRates).push(paxPerHour);

      const ref: EfficiencyFlightRef = {
        flightId: r.flight_id,
        ts: r.mission_start_ts ?? "",
        route: `${(r.departure_icao || "?").toUpperCase()} → ${(r.destination_icao || "?").toUpperCase()}`,
        minutes,
        pax,
        paxPerHour,
      };
      if (!a.best || paxPerHour > a.best.paxPerHour) a.best = ref;
      if (!a.worst || paxPerHour < a.worst.paxPerHour) a.worst = ref;
    }

    const outRows: EfficiencyRow[] = Array.from(aggs.values())
      .map((a) => ({
        key: a.key,
        kind: a.kind,
        name: a.kind === "generic" ? `Generic ${a.name}` : a.name,
        registration: a.registration,
        icao: a.icao,
        flights: a.flights,
        minutes: a.minutes,
        income: a.income,
        pax: a.pax,
        paxPerHour: a.minutes > 0 ? a.pax / (a.minutes / 60) : 0,
        paxPerMinute: a.minutes > 0 ? a.pax / a.minutes : 0,
        medianPaxPerHour: median(a.rates),
        best: a.best,
        worst: a.worst,
        confidence: confidenceOf(a.flights),
      }))
      .sort((x, y) => y.paxPerHour - x.paxPerHour);

    // Histogram over per-flight PAX/hour, split owned vs generic.
    const all = [...ownedRates, ...genericRates];
    const histogram: EfficiencyHistogramBin[] = [];
    if (all.length > 0) {
      const max = Math.max(...all);
      const binCount = 12;
      const width = Math.max(1, Math.ceil(max / binCount));
      for (let i = 0; i < binCount; i++) {
        histogram.push({ from: i * width, to: (i + 1) * width, owned: 0, generic: 0 });
      }
      for (const v of ownedRates) {
        const i = Math.min(binCount - 1, Math.floor(v / width));
        histogram[i].owned += 1;
      }
      for (const v of genericRates) {
        const i = Math.min(binCount - 1, Math.floor(v / width));
        histogram[i].generic += 1;
      }
    }

    const totMin = outRows.reduce((s, r) => s + r.minutes, 0);
    const totPax = outRows.reduce((s, r) => s + r.pax, 0);

    return {
      username,
      windowDays: days,
      rows: outRows,
      histogram,
      overall: {
        flights: outRows.reduce((s, r) => s + r.flights, 0),
        minutes: totMin,
        pax: totPax,
        income: outRows.reduce((s, r) => s + r.income, 0),
        paxPerHour: totMin > 0 ? totPax / (totMin / 60) : 0,
        medianPaxPerHour: median(all),
      },
      excluded,
      fetchedAt: new Date().toISOString(),
    };
  });

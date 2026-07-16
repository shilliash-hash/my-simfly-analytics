// Pure Active/Passive classifier over the shared IncomeLedger.
// Reads only the ledger produced by simfly.functions.ts::buildIncomeLedger.
// Contains ZERO fetching, ZERO SQL, ZERO accounting math beyond partitioning
// the trusted per-flight numbers into Active/Passive buckets and rolling them
// up per airport / per aircraft / per day.

import type { IncomeLedger, IncomeLedgerMyFlight, IncomeLedgerVisitorFlight } from "./types";

export type IncomeRange = "7d" | "30d" | "90d" | "365d" | "all";

export type IncomeTimeseriesPoint = { date: string; active: number; passive: number; total: number };

export type IncomeComponent = {
  key: "active_missions" | "passive_visitors";
  label: string;
  amount: number;
  flights: number;
};

export type IncomePerAirport = { icao: string; name: string; pax: number; flights: number };

export type IncomePerAircraft = {
  aircraftId: string;
  label: string;
  registration?: string;
  flightsMe: number;
  flightsOthers: number;
  active: number;         // Σ paxAircraftOwn on my flights on this aircraft
  passive: number;        // Σ paxAircraft on visitor flights on this aircraft
  total: number;
  activePct: number;
  passivePct: number;
};

export type IncomeReport = {
  range: IncomeRange;
  rangeStart: string | null;
  totals: {
    active: number;
    passive: number;
    total: number;
    activeFlights: number;
    passiveFlights: number;
    ownedAirports: number;
    ownedAircraft: number;
  };
  composition: IncomeComponent[];
  timeseries: IncomeTimeseriesPoint[];
  kpis: {
    passiveShare: number;
    dailyAverage: number;
    passiveMomentum: number | null;
    concentration: number;
    topAirport: { icao: string; pax: number } | null;
    coverageFlights: number;
  };
  perAirportPassive: IncomePerAirport[];
  perAircraft: IncomePerAircraft[];
  reconciliation: {
    active: number;
    passive: number;
    computedTotal: number;
    ledgerTotal: number; // Σ myFlights.pax + Σ paxAirport + Σ paxAircraft over the same window
    diff: number;
    aircraftActiveSum: number;   // Σ paxAircraftOwn (window) — expected == Σ perAircraft.active
    aircraftPassiveSum: number;  // Σ paxAircraft on visitors (window) — expected == Σ perAircraft.passive
    withinTolerance: boolean;
  };
  coverage: {
    earliestFlight: string | null;
    latestFlight: string | null;
    note: string;
  };
};

const DAY = 86_400_000;

function rangeStartIso(range: IncomeRange): string | null {
  const now = Date.now();
  switch (range) {
    case "7d":
      return new Date(now - 7 * DAY).toISOString();
    case "30d":
      return new Date(now - 30 * DAY).toISOString();
    case "90d":
      return new Date(now - 90 * DAY).toISOString();
    case "365d":
      return new Date(now - 365 * DAY).toISOString();
    case "all":
    default:
      return null;
  }
}

function inRange(ts: string, startIso: string | null): boolean {
  if (!startIso) return true;
  if (!ts) return false;
  return ts >= startIso;
}

function dateKey(ts: string): string {
  return ts.slice(0, 10);
}

export function classify(ledger: IncomeLedger, range: IncomeRange): IncomeReport {
  const startIso = rangeStartIso(range);

  const myFlights: IncomeLedgerMyFlight[] = ledger.myFlights.filter((f) => inRange(f.ts, startIso));
  const visitorFlights: IncomeLedgerVisitorFlight[] = ledger.visitorFlights.filter((v) => inRange(v.ts, startIso));

  // Totals -------------------------------------------------------------------
  let active = 0;
  const buckets = new Map<string, IncomeTimeseriesPoint>();
  for (const f of myFlights) {
    active += f.pax;
    if (!f.ts) continue;
    const k = dateKey(f.ts);
    const cur = buckets.get(k) ?? { date: k, active: 0, passive: 0, total: 0 };
    cur.active += f.pax;
    cur.total += f.pax;
    buckets.set(k, cur);
  }

  let passive = 0;
  let aircraftPassiveSum = 0;
  const perAirport = new Map<string, { pax: number; flights: number }>();
  for (const v of visitorFlights) {
    const pAirport = v.paxAirport || 0;
    const pAircraft = v.paxAircraft || 0;
    passive += pAirport + pAircraft;
    aircraftPassiveSum += pAircraft;
    if (v.ts) {
      const k = dateKey(v.ts);
      const cur = buckets.get(k) ?? { date: k, active: 0, passive: 0, total: 0 };
      cur.passive += pAirport + pAircraft;
      cur.total += pAirport + pAircraft;
      buckets.set(k, cur);
    }
    // per-airport passive attribution: airport slot only, using the origin/dest
    // ICAO that is one of my owned hubs.
    const owned = new Set(ledger.ownedAirports.map((a) => a.icao.toUpperCase()));
    const oOwn = v.originIcao ? owned.has(v.originIcao.toUpperCase()) : false;
    const dOwn = v.destIcao ? owned.has(v.destIcao.toUpperCase()) : false;
    const primaryIcao = dOwn ? v.destIcao : oOwn ? v.originIcao : v.airportIcao;
    if (pAirport > 0 && primaryIcao) {
      const key = primaryIcao.toUpperCase();
      const cur = perAirport.get(key) ?? { pax: 0, flights: 0 };
      cur.pax += pAirport;
      cur.flights += 1;
      perAirport.set(key, cur);
    }
  }

  const total = active + passive;
  const composition: IncomeComponent[] = [
    { key: "active_missions", label: "Active — Own Flying", amount: active, flights: myFlights.length },
    {
      key: "passive_visitors",
      label: "Passive — Airports & Rentals",
      amount: passive,
      flights: visitorFlights.length,
    },
  ];

  // Timeseries: densify (no gaps) between range start (or earliest) and today.
  const startKey = startIso
    ? startIso.slice(0, 10)
    : (Array.from(buckets.keys()).sort()[0] ?? new Date().toISOString().slice(0, 10));
  const endKey = new Date().toISOString().slice(0, 10);
  const timeseries: IncomeTimeseriesPoint[] = [];
  {
    const cur = new Date(`${startKey}T00:00:00Z`);
    const end = new Date(`${endKey}T00:00:00Z`);
    while (cur.getTime() <= end.getTime()) {
      const k = cur.toISOString().slice(0, 10);
      timeseries.push(buckets.get(k) ?? { date: k, active: 0, passive: 0, total: 0 });
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  }

  // KPIs ---------------------------------------------------------------------
  const days = Math.max(1, timeseries.length);
  const passiveShare = total > 0 ? passive / total : 0;
  const dailyAverage = total / days;

  const now = Date.now();
  let last30 = 0;
  let prev30 = 0;
  for (const v of ledger.visitorFlights) {
    if (!v.ts) continue;
    const t = new Date(v.ts).getTime();
    if (!Number.isFinite(t)) continue;
    const age = now - t;
    const amt = (v.paxAirport || 0) + (v.paxAircraft || 0);
    if (age <= 30 * DAY) last30 += amt;
    else if (age <= 60 * DAY) prev30 += amt;
  }
  const passiveMomentum = prev30 > 0 ? last30 / prev30 : null;

  // HHI concentration on passive per-airport pax.
  const perAirportArr: IncomePerAirport[] = Array.from(perAirport.entries())
    .map(([icao, v]) => ({
      icao,
      name: ledger.ownedAirports.find((a) => a.icao.toUpperCase() === icao)?.name ?? icao,
      pax: v.pax,
      flights: v.flights,
    }))
    .sort((a, b) => b.pax - a.pax);
  const totalPassivePax = perAirportArr.reduce((s, v) => s + v.pax, 0);
  let hhi = 0;
  if (totalPassivePax > 0) {
    for (const v of perAirportArr) {
      const share = v.pax / totalPassivePax;
      hhi += share * share;
    }
  }
  const topAirport = perAirportArr[0] ? { icao: perAirportArr[0].icao, pax: perAirportArr[0].pax } : null;

  // Per-aircraft — aircraft components ONLY. Airport & licence income excluded.
  let aircraftActiveSum = 0;
  const perAircraftMap = new Map<
    string,
    { label: string; registration?: string; flightsMe: number; flightsOthers: number; active: number; passive: number }
  >();
  for (const p of ledger.ownedAircraft) {
    perAircraftMap.set(p.aircraftId, {
      label: p.label,
      registration: p.registration,
      flightsMe: 0,
      flightsOthers: 0,
      active: 0,
      passive: 0,
    });
  }
  for (const f of myFlights) {
    if (!f.aircraftId || !perAircraftMap.has(f.aircraftId)) continue;
    if (!f.ownAircraft) continue; // renting someone else's plane — not aircraft-owner income
    const cur = perAircraftMap.get(f.aircraftId)!;
    cur.flightsMe += 1;
    cur.active += f.paxAircraftOwn;
    aircraftActiveSum += f.paxAircraftOwn;
  }
  for (const v of visitorFlights) {
    if (!v.aircraftId || !perAircraftMap.has(v.aircraftId)) continue;
    const cur = perAircraftMap.get(v.aircraftId)!;
    cur.flightsOthers += 1;
    cur.passive += v.paxAircraft || 0;
  }
  const perAircraft: IncomePerAircraft[] = Array.from(perAircraftMap.entries())
    .map(([aircraftId, v]) => {
      const t = v.active + v.passive;
      return {
        aircraftId,
        label: v.label,
        registration: v.registration,
        flightsMe: v.flightsMe,
        flightsOthers: v.flightsOthers,
        active: v.active,
        passive: v.passive,
        total: t,
        activePct: t > 0 ? v.active / t : 0,
        passivePct: t > 0 ? v.passive / t : 0,
      };
    })
    .sort((a, b) => b.total - a.total);

  // Reconciliation -----------------------------------------------------------
  const ledgerTotal =
    myFlights.reduce((s, f) => s + f.pax, 0) +
    visitorFlights.reduce((s, v) => s + (v.paxAirport || 0) + (v.paxAircraft || 0), 0);
  const diff = active + passive - ledgerTotal;

  const allTs = [...ledger.myFlights.map((f) => f.ts), ...ledger.visitorFlights.map((v) => v.ts)]
    .filter(Boolean)
    .sort();
  const earliest = allTs[0] ?? null;
  const latest = allTs[allTs.length - 1] ?? null;

  return {
    range,
    rangeStart: startIso,
    totals: {
      active,
      passive,
      total,
      activeFlights: myFlights.length,
      passiveFlights: visitorFlights.length,
      ownedAirports: ledger.ownedAirports.length,
      ownedAircraft: ledger.ownedAircraft.length,
    },
    composition,
    timeseries,
    kpis: {
      passiveShare,
      dailyAverage,
      passiveMomentum,
      concentration: hhi,
      topAirport,
      coverageFlights: myFlights.length + visitorFlights.length,
    },
    perAirportPassive: perAirportArr,
    perAircraft,
    reconciliation: {
      active,
      passive,
      computedTotal: active + passive,
      ledgerTotal,
      diff,
      aircraftActiveSum,
      aircraftPassiveSum,
      withinTolerance: Math.abs(diff) <= 0.01,
    },
    coverage: {
      earliestFlight: earliest,
      latestFlight: latest,
      note:
        "All totals derive from the shared Stats accounting ledger. Active + Passive equals Stats total for the same window. Per-aircraft numbers cover aircraft-owner income only — airport and licence earnings are not attributed to any aircraft.",
    },
  };
}

// Mission Intelligence — pure prediction engine.
//
// This file contains ZERO I/O. It takes a MissionEvidence bundle (assembled
// elsewhere from the shared income ledger) plus MissionInputs and returns a
// MissionPrediction. It never fetches, never re-scans SimFly, and never
// duplicates accounting — every historical number originates in the ledger
// produced by buildIncomeLedger().

import type { IncomeLedger } from "./types";
import { computeEta, haversineNm, lookupAircraftSpec } from "./aircraft-specs";

// ---------- Inputs & outputs ----------

export type MissionInputs = {
  departure: { icao: string; lat?: number; lon?: number };
  arrival: { icao: string; lat?: number; lon?: number };
  aircraftId?: string;
  aircraftIcao?: string;
  aircraftLabel?: string;
  aircraftTier?: number;
  aircraftLevel?: number;
  licence?: string;
  dateIso?: string;
};

export type ConfidenceTier = "direct" | "near" | "class" | "formula" | "none";

export type ComponentEstimate = {
  key: "aircraft" | "airport_dep" | "airport_arr" | "licence";
  label: string;
  value: number;
  sampleSize: number;
  tier: ConfidenceTier;
  confidence: number; // 0..100
  note: string;
};

export type MissionSignal = {
  key: string;
  label: string;
  value: string;
  tone: "positive" | "neutral" | "warn";
  hint?: string;
};

export type MissionPrediction = {
  inputs: MissionInputs;
  distanceNm: number | null;
  flightTimeMs: number | null;
  cruiseKt: number | null;
  totalPax: number;
  paxPerHour: number | null;
  overallConfidence: number;
  components: ComponentEstimate[];
  signals: MissionSignal[];
  coverage: {
    myFlights: number;
    visitorFlights: number;
    ledgerEarliest: string | null;
    ledgerLatest: string | null;
    ownAircraft: boolean;
    ownDeparture: boolean;
    ownArrival: boolean;
  };
};

// ---------- Evidence bundle ----------

export type MissionEvidence = {
  ledger: IncomeLedger;
  ownedIcaos: Set<string>;
  ownedAircraftIds: Set<string>;
  aircraftIcaoById: Map<string, string>;
  // Alliance-style relationship signal — populated when data is available.
  frequentVisitorsAt: Map<string, number>; // icao -> visits by top pilots
};

// ---------- Helpers ----------

const MIN_DIRECT = 4;
const MIN_NEAR = 3;
const MIN_CLASS = 5;

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

function confidenceFromTier(tier: ConfidenceTier, n: number): number {
  switch (tier) {
    case "direct":
      return Math.min(100, 85 + Math.min(15, n));
    case "near":
      return Math.min(89, 65 + Math.min(20, n * 2));
    case "class":
      return Math.min(69, 45 + Math.min(20, n * 2));
    case "formula":
      return 30;
    case "none":
    default:
      return 10;
  }
}

// ---------- Component estimators ----------

/** Aircraft-owner component — expected paxAircraftOwn for this flight. */
function estimateAircraftComponent(
  inputs: MissionInputs,
  ev: MissionEvidence,
  flightTimeHours: number,
): ComponentEstimate {
  const acId = inputs.aircraftId;
  const acIcao = (inputs.aircraftIcao || "").toUpperCase();
  const ownAircraft = !!acId && ev.ownedAircraftIds.has(acId);

  if (!ownAircraft) {
    return {
      key: "aircraft",
      label: "Aircraft owner income",
      value: 0,
      sampleSize: 0,
      tier: "none",
      confidence: 100, // certain: no share when the plane isn't mine
      note: "You don't own this aircraft — no aircraft-owner share.",
    };
  }

  // Direct: same aircraft flown by me on same corridor.
  const dep = inputs.departure.icao.toUpperCase();
  const arr = inputs.arrival.icao.toUpperCase();
  const directRows = ev.ledger.myFlights.filter(
    (f) =>
      f.ownAircraft &&
      f.aircraftId === acId &&
      f.originIcao === dep &&
      f.destIcao === arr,
  );
  if (directRows.length >= MIN_DIRECT) {
    const v = median(directRows.map((r) => r.paxAircraftOwn));
    return {
      key: "aircraft",
      label: "Aircraft owner income",
      value: v,
      sampleSize: directRows.length,
      tier: "direct",
      confidence: confidenceFromTier("direct", directRows.length),
      note: `Median of ${directRows.length} same aircraft × same corridor flights.`,
    };
  }

  // Near: same aircraft on any corridor.
  const nearRows = ev.ledger.myFlights.filter(
    (f) => f.ownAircraft && f.aircraftId === acId,
  );
  if (nearRows.length >= MIN_NEAR) {
    const v = median(nearRows.map((r) => r.paxAircraftOwn));
    return {
      key: "aircraft",
      label: "Aircraft owner income",
      value: v,
      sampleSize: nearRows.length,
      tier: "near",
      confidence: confidenceFromTier("near", nearRows.length),
      note: `Median across ${nearRows.length} flights on this aircraft.`,
    };
  }

  // Class: any of my owned aircraft with same ICAO type.
  const classRows = ev.ledger.myFlights.filter((f) => {
    if (!f.ownAircraft || !f.aircraftId) return false;
    const t = ev.aircraftIcaoById.get(f.aircraftId);
    return t && t.toUpperCase() === acIcao;
  });
  if (classRows.length >= MIN_CLASS) {
    const v = median(classRows.map((r) => r.paxAircraftOwn));
    return {
      key: "aircraft",
      label: "Aircraft owner income",
      value: v,
      sampleSize: classRows.length,
      tier: "class",
      confidence: confidenceFromTier("class", classRows.length),
      note: `Median across ${classRows.length} flights on aircraft of type ${acIcao || "same type"}.`,
    };
  }

  // Formula fallback — proportional to flight hours × class average rate.
  const anyOwn = ev.ledger.myFlights.filter((f) => f.ownAircraft && f.paxAircraftOwn > 0);
  const perFlight = anyOwn.length > 0 ? mean(anyOwn.map((r) => r.paxAircraftOwn)) : 0;
  const scaled = perFlight * Math.max(0.5, Math.min(3, flightTimeHours || 1));
  return {
    key: "aircraft",
    label: "Aircraft owner income",
    value: scaled,
    sampleSize: anyOwn.length,
    tier: anyOwn.length > 0 ? "formula" : "none",
    confidence: confidenceFromTier(anyOwn.length > 0 ? "formula" : "none", anyOwn.length),
    note:
      anyOwn.length > 0
        ? `Class-mean rate scaled by flight time (${anyOwn.length} owner flights in ledger).`
        : "No historical aircraft-owner income in ledger.",
  };
}

/** Airport-owner component for one endpoint (dep or arr). */
function estimateAirportEndpoint(
  role: "dep" | "arr",
  icao: string,
  ev: MissionEvidence,
): ComponentEstimate {
  const key = role === "dep" ? "airport_dep" : "airport_arr";
  const label = role === "dep" ? "Departure airport income" : "Arrival airport income";
  const up = icao.toUpperCase();
  const own = ev.ownedIcaos.has(up);
  if (!own) {
    return {
      key,
      label,
      value: 0,
      sampleSize: 0,
      tier: "none",
      confidence: 100,
      note: `${up} is not yours — no airport-owner share.`,
    };
  }

  // Combine two pieces:
  //  (a) my own paxAirportOwn when I flew from/to this icao.
  //  (b) paxAirport when visitors flew through the same icao role.
  const myRole = ev.ledger.myFlights.filter((f) =>
    role === "dep" ? f.originIcao === up : f.destIcao === up,
  );
  const visRole = ev.ledger.visitorFlights.filter((v) =>
    role === "dep" ? (v.originIcao || "").toUpperCase() === up : (v.destIcao || "").toUpperCase() === up,
  );

  const myValues = myRole.map((r) => r.paxAirportOwn).filter((v) => v > 0);
  const visValues = visRole.map((v) => v.paxAirport).filter((v) => v > 0);
  const combined = [...myValues, ...visValues];

  if (combined.length >= MIN_DIRECT) {
    const v = median(combined);
    return {
      key,
      label,
      value: v,
      sampleSize: combined.length,
      tier: "direct",
      confidence: confidenceFromTier("direct", combined.length),
      note: `Median of ${combined.length} historical ${role === "dep" ? "departures" : "arrivals"} at ${up}.`,
    };
  }
  if (combined.length >= MIN_NEAR) {
    const v = mean(combined);
    return {
      key,
      label,
      value: v,
      sampleSize: combined.length,
      tier: "near",
      confidence: confidenceFromTier("near", combined.length),
      note: `Mean of ${combined.length} historical ${role === "dep" ? "departures" : "arrivals"} at ${up}.`,
    };
  }
  // Class fallback: any activity at this airport (either role).
  const anyRole = [
    ...ev.ledger.myFlights.filter((f) => f.originIcao === up || f.destIcao === up).map((r) => r.paxAirportOwn),
    ...ev.ledger.visitorFlights
      .filter((v) => (v.originIcao || "").toUpperCase() === up || (v.destIcao || "").toUpperCase() === up)
      .map((v) => v.paxAirport),
  ].filter((v) => v > 0);
  if (anyRole.length >= MIN_CLASS) {
    return {
      key,
      label,
      value: mean(anyRole),
      sampleSize: anyRole.length,
      tier: "class",
      confidence: confidenceFromTier("class", anyRole.length),
      note: `Class mean of ${anyRole.length} flights at ${up} (any direction).`,
    };
  }
  if (anyRole.length > 0) {
    return {
      key,
      label,
      value: mean(anyRole),
      sampleSize: anyRole.length,
      tier: "formula",
      confidence: confidenceFromTier("formula", anyRole.length),
      note: `Thin sample (${anyRole.length}) — using average.`,
    };
  }
  return {
    key,
    label,
    value: 0,
    sampleSize: 0,
    tier: "none",
    confidence: confidenceFromTier("none", 0),
    note: `No historical flights at ${up} yet.`,
  };
}

/** Licence component — expected paxOther that maps to the licence share. */
function estimateLicenceComponent(inputs: MissionInputs, ev: MissionEvidence): ComponentEstimate {
  const code = (inputs.licence || "").trim().toUpperCase();
  if (!code) {
    return {
      key: "licence",
      label: "Licence income",
      value: 0,
      sampleSize: 0,
      tier: "none",
      confidence: 20,
      note: "No licence selected.",
    };
  }
  const direct = ev.ledger.myFlights.filter((f) => (f.licence || "").toUpperCase() === code);
  if (direct.length >= MIN_DIRECT) {
    const v = median(direct.map((r) => r.paxOther));
    return {
      key: "licence",
      label: "Licence income",
      value: v,
      sampleSize: direct.length,
      tier: "direct",
      confidence: confidenceFromTier("direct", direct.length),
      note: `Median 'other' share across ${direct.length} flights on ${code}.`,
    };
  }
  if (direct.length >= MIN_NEAR) {
    return {
      key: "licence",
      label: "Licence income",
      value: mean(direct.map((r) => r.paxOther)),
      sampleSize: direct.length,
      tier: "near",
      confidence: confidenceFromTier("near", direct.length),
      note: `Mean of ${direct.length} flights on ${code}.`,
    };
  }
  // Class fallback: any licence, any flight.
  const anyRow = ev.ledger.myFlights.filter((f) => f.paxOther > 0);
  if (anyRow.length >= MIN_CLASS) {
    return {
      key: "licence",
      label: "Licence income",
      value: mean(anyRow.map((r) => r.paxOther)),
      sampleSize: anyRow.length,
      tier: "class",
      confidence: confidenceFromTier("class", anyRow.length),
      note: `Class mean across ${anyRow.length} flights — no direct history on ${code}.`,
    };
  }
  return {
    key: "licence",
    label: "Licence income",
    value: anyRow.length > 0 ? mean(anyRow.map((r) => r.paxOther)) : 0,
    sampleSize: anyRow.length,
    tier: anyRow.length > 0 ? "formula" : "none",
    confidence: confidenceFromTier(anyRow.length > 0 ? "formula" : "none", anyRow.length),
    note:
      anyRow.length > 0
        ? "Fallback — very thin licence history."
        : "No licence history in ledger.",
  };
}

// ---------- Assembler ----------

export function predictMission(inputs: MissionInputs, ev: MissionEvidence): MissionPrediction {
  const depUp = inputs.departure.icao.toUpperCase();
  const arrUp = inputs.arrival.icao.toUpperCase();
  const { spec } = lookupAircraftSpec(inputs.aircraftIcao);

  let distanceNm: number | null = null;
  let flightTimeMs: number | null = null;
  let cruiseKt: number | null = spec.cruiseKt;

  if (
    Number.isFinite(inputs.departure.lat) &&
    Number.isFinite(inputs.departure.lon) &&
    Number.isFinite(inputs.arrival.lat) &&
    Number.isFinite(inputs.arrival.lon)
  ) {
    distanceNm = haversineNm(
      { lat: inputs.departure.lat as number, lon: inputs.departure.lon as number },
      { lat: inputs.arrival.lat as number, lon: inputs.arrival.lon as number },
    );
    const eta = computeEta({
      departureMs: Date.now(),
      origin: { lat: inputs.departure.lat as number, lon: inputs.departure.lon as number },
      destination: { lat: inputs.arrival.lat as number, lon: inputs.arrival.lon as number },
      aircraftICAO: inputs.aircraftIcao,
    });
    if (eta) {
      flightTimeMs = eta.durationMs;
      cruiseKt = eta.cruiseKt;
    }
  }

  const flightTimeHours = flightTimeMs ? flightTimeMs / 3_600_000 : 0;

  const aircraft = estimateAircraftComponent(inputs, ev, flightTimeHours);
  const dep = estimateAirportEndpoint("dep", depUp, ev);
  const arr = estimateAirportEndpoint("arr", arrUp, ev);
  const licence = estimateLicenceComponent(inputs, ev);
  const components = [aircraft, dep, arr, licence];

  const totalPax = components.reduce((s, c) => s + c.value, 0);
  const paxPerHour = flightTimeHours > 0 ? totalPax / flightTimeHours : null;

  // Overall confidence: weighted by each component's share of total pax.
  let overall = 0;
  if (totalPax > 0) {
    for (const c of components) {
      const w = c.value / totalPax;
      overall += w * c.confidence;
    }
  } else {
    overall = mean(components.map((c) => c.confidence));
  }

  // Signals — soft intelligence.
  const signals: MissionSignal[] = [];
  if (distanceNm !== null && spec.rangeNm && distanceNm > spec.rangeNm) {
    signals.push({
      key: "range",
      label: "Range warning",
      value: `${distanceNm.toFixed(0)} / ${spec.rangeNm} NM`,
      tone: "warn",
      hint: `${spec.model} typical range is ${spec.rangeNm} NM.`,
    });
  }
  if (paxPerHour !== null) {
    signals.push({
      key: "pph",
      label: "PAX / hour",
      value: paxPerHour.toFixed(1),
      tone: "neutral",
    });
  }
  const visitFreq = ev.frequentVisitorsAt.get(arrUp) ?? 0;
  if (visitFreq > 0) {
    signals.push({
      key: "relationship",
      label: "Relationship",
      value: `${visitFreq} visit${visitFreq === 1 ? "" : "s"}`,
      tone: "positive",
      hint: "Pilot from this destination has flown to your airports.",
    });
  }
  if (ev.ownedIcaos.has(depUp) && ev.ownedIcaos.has(arrUp)) {
    signals.push({
      key: "hub_to_hub",
      label: "Hub-to-hub",
      value: "yes",
      tone: "positive",
      hint: "Both endpoints are yours — full airport-owner share on both sides.",
    });
  }

  return {
    inputs,
    distanceNm,
    flightTimeMs,
    cruiseKt,
    totalPax,
    paxPerHour,
    overallConfidence: Math.round(overall),
    components,
    signals,
    coverage: {
      myFlights: ev.ledger.myFlights.length,
      visitorFlights: ev.ledger.visitorFlights.length,
      ledgerEarliest: ev.ledger.window.earliestIso,
      ledgerLatest: ev.ledger.window.latestIso,
      ownAircraft: !!inputs.aircraftId && ev.ownedAircraftIds.has(inputs.aircraftId),
      ownDeparture: ev.ownedIcaos.has(depUp),
      ownArrival: ev.ownedIcaos.has(arrUp),
    },
  };
}

// ---------- Evidence builder ----------

export function buildEvidence(args: {
  ledger: IncomeLedger;
  aircraftIcaoById: Record<string, string>;
}): MissionEvidence {
  const ownedIcaos = new Set(args.ledger.ownedAirports.map((a) => a.icao.toUpperCase()));
  const ownedAircraftIds = new Set(args.ledger.ownedAircraft.map((a) => a.aircraftId));
  const aircraftIcaoById = new Map<string, string>(Object.entries(args.aircraftIcaoById));

  // Frequent-visitor destinations: count how often each visitor pilot arrived.
  const byPilot = new Map<string, number>();
  for (const v of args.ledger.visitorFlights) {
    if (!v.pilot) continue;
    byPilot.set(v.pilot, (byPilot.get(v.pilot) ?? 0) + 1);
  }
  const topPilots = new Set(
    Array.from(byPilot.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([p]) => p),
  );
  const frequentVisitorsAt = new Map<string, number>();
  for (const v of args.ledger.visitorFlights) {
    if (!v.pilot || !topPilots.has(v.pilot)) continue;
    for (const icao of [v.originIcao, v.destIcao]) {
      if (!icao) continue;
      const k = icao.toUpperCase();
      if (ownedIcaos.has(k)) continue; // already ours
      frequentVisitorsAt.set(k, (frequentVisitorsAt.get(k) ?? 0) + 1);
    }
  }

  return { ledger: args.ledger, ownedIcaos, ownedAircraftIds, aircraftIcaoById, frequentVisitorsAt };
}

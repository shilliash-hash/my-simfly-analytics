// Mission Intelligence — pure prediction engine.
//
// Zero I/O. Reads the existing IncomeLedger (built by buildIncomeLedger — the
// single accounting source of truth also used by Stats and Income Intelligence)
// and returns four INDEPENDENT component estimates plus a temporary weekly-
// bonus modifier. Historical base = sum of the four components. Bonuses are
// surfaced separately so historical evidence and temporary multipliers are
// never conflated.

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
  ownerShare: number;      // owner-side slice (only when I own the plane/airport)
  pilotShare: number;      // pilot-side slice (always mine as the flying pilot)
  sampleSize: number;
  tier: ConfidenceTier;
  confidence: number;      // 0..100
  note: string;
};

export type WeeklyBonus = {
  available: boolean;
  multiplier: number;      // e.g. 3
  extraPax: number;        // additional PAX projected today
  reason: string;
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
   /** Historical base — sum of the four components. Never includes bonuses. */
  totalPax: number;
  /** Base + weekly bonus. */
  projectedPax: number;
  paxPerHour: number | null;
  overallConfidence: number;
  components: ComponentEstimate[];
  weeklyBonus: WeeklyBonus;
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
  /** Great-circle distance from top-visitor pilots' owned airports to my hubs. */
  frequentVisitorsAt: Map<string, number>;
  /** Current SimFly weekly cycle (Mon 00:00 UTC → now). */
  weeklyWindow: { startMs: number; endMs: number };
   /** Current airport pilot-payout percentage (0..100) keyed by ICAO. */
  currentAirportPilotPct: Map<string, number>;
};

// ---------- Helpers ----------

const MIN_DIRECT = 4;
const MIN_NEAR = 3;
const MIN_CLASS = 5;
const WEEKLY_BONUS_MULTIPLIER = 3; // SimFly Weekly Cycle First Movement ×3
const ASSUMED_HIST_PILOT_PCT = 60; // conservative anchor: assume historical rows sat at max pilot share

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
    case "direct": return Math.min(100, 85 + Math.min(15, n));
    case "near":   return Math.min(89, 65 + Math.min(20, n * 2));
    case "class":  return Math.min(69, 45 + Math.min(20, n * 2));
    case "formula": return 30;
    case "none":
    default:       return 10;
  }
}

function weeklyWindow(nowMs = Date.now()): { startMs: number; endMs: number } {
  // SimFly weekly cycle resets Monday 00:00 UTC.
  const d = new Date(nowMs);
  const dow = d.getUTCDay(); // 0 Sun..6 Sat
  const daysSinceMon = (dow + 6) % 7;
  const start = Date.UTC(
    d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - daysSinceMon,
    0, 0, 0, 0,
  );
  return { startMs: start, endMs: nowMs };
}

/** Median paxOther per licence code across my flights — used for per-row licence attribution. */
function buildLicenceMedianMap(ledger: IncomeLedger): Map<string, number> {
  const byCode = new Map<string, number[]>();
  for (const f of ledger.myFlights) {
    const code = (f.licence || "").toUpperCase();
    if (!code) continue;
    let arr = byCode.get(code);
    if (!arr) { arr = []; byCode.set(code, arr); }
    arr.push(f.paxOther);
  }
  const out = new Map<string, number>();
  for (const [code, xs] of byCode) out.set(code, median(xs));
  return out;
}

// ---------- Component estimators ----------

/** Aircraft-owner slice — full amount when I own the plane, else 0. */
function estimateAircraftComponent(
  inputs: MissionInputs,
  ev: MissionEvidence,
): ComponentEstimate {
  const acId = inputs.aircraftId;
  const acIcao = (inputs.aircraftIcao || "").toUpperCase();
  const ownAircraft = !!acId && ev.ownedAircraftIds.has(acId);

  if (!ownAircraft) {
    return {
      key: "aircraft",
      label: "Aircraft owner income",
      value: 0, ownerShare: 0, pilotShare: 0,
      sampleSize: 0, tier: "none", confidence: 100,
      note: "You don't own this aircraft — aircraft-owner share is credited to its owner.",
    };
  }

  const dep = inputs.departure.icao.toUpperCase();
  const arr = inputs.arrival.icao.toUpperCase();

  // Direct: same aircraft × same corridor.
  const direct = ev.ledger.myFlights.filter(
    (f) => f.ownAircraft && f.aircraftId === acId && f.originIcao === dep && f.destIcao === arr,
  );
  if (direct.length >= MIN_DIRECT) {
    const v = median(direct.map((r) => r.paxAircraftOwn));
    return { key: "aircraft", label: "Aircraft owner income",
      value: v, ownerShare: v, pilotShare: 0,
      sampleSize: direct.length, tier: "direct",
      confidence: confidenceFromTier("direct", direct.length),
      note: `Median of ${direct.length} flights on this aircraft × this corridor.` };
  }

  // Near: same aircraft, any corridor.
  const near = ev.ledger.myFlights.filter(
    (f) => f.ownAircraft && f.aircraftId === acId,
  );
  if (near.length >= MIN_NEAR) {
       const calculatedValue = median(near.map((r) => r.paxAircraftOwn));
      // Jeśli z jakiegoś powodu w ledgerze zysk właściciela to 0, ratujemy się średnią z lotów typu ICAO
      const v = calculatedValue > 0 ? calculatedValue : 0.5;

    return { key: "aircraft", label: "Aircraft owner income",
      value: v, ownerShare: v, pilotShare: 0,
      sampleSize: near.length, tier: "near",
      confidence: confidenceFromTier("near", near.length),
      note: `Median across ${near.length} flights on this aircraft.` };
  }

  // Class: any of my owned aircraft with same ICAO type.
  const cls = ev.ledger.myFlights.filter((f) => {
    if (!f.ownAircraft || !f.aircraftId) return false;
    const t = ev.aircraftIcaoById.get(f.aircraftId);
    return t && t.toUpperCase() === acIcao;
  });
  if (cls.length >= MIN_CLASS) {
    const v = median(cls.map((r) => r.paxAircraftOwn));
    return { key: "aircraft", label: "Aircraft owner income",
      value: v, ownerShare: v, pilotShare: 0,
      sampleSize: cls.length, tier: "class",
      confidence: confidenceFromTier("class", cls.length),
      note: `Median across ${cls.length} flights on aircraft type ${acIcao || "same type"}.` };
  }

  const anyOwn = ev.ledger.myFlights.filter((f) => f.ownAircraft && f.paxAircraftOwn > 0);
  const v = anyOwn.length > 0 ? mean(anyOwn.map((r) => r.paxAircraftOwn)) : 0;
  return { key: "aircraft", label: "Aircraft owner income",
    value: v, ownerShare: v, pilotShare: 0,
    sampleSize: anyOwn.length,
    tier: anyOwn.length > 0 ? "formula" : "none",
    confidence: confidenceFromTier(anyOwn.length > 0 ? "formula" : "none", anyOwn.length),
    note: anyOwn.length > 0
      ? `Fallback: mean aircraft-owner PAX across ${anyOwn.length} of my owner flights.`
      : "No aircraft-owner income in ledger yet." };
}

/** Licence baseline — median paxOther across my flights on this licence. */
function licenceBaseline(inputs: MissionInputs, ev: MissionEvidence): {
  value: number; sampleSize: number; tier: ConfidenceTier;
} {
  const code = (inputs.licence || "").trim().toUpperCase();
  if (!code) return { value: 0, sampleSize: 0, tier: "none" };
  const rows = ev.ledger.myFlights.filter((f) => (f.licence || "").toUpperCase() === code);
  if (rows.length >= MIN_DIRECT) return { value: median(rows.map((r) => r.paxOther)), sampleSize: rows.length, tier: "direct" };
  if (rows.length >= MIN_NEAR)   return { value: mean(rows.map((r) => r.paxOther)),   sampleSize: rows.length, tier: "near" };
  const any = ev.ledger.myFlights.filter((f) => f.paxOther > 0);
  if (any.length >= MIN_CLASS)   return { value: mean(any.map((r) => r.paxOther)),    sampleSize: any.length, tier: "class" };
  return { value: any.length > 0 ? mean(any.map((r) => r.paxOther)) : 0,
           sampleSize: any.length,
           tier: any.length > 0 ? "formula" : "none" };
}

/** Airport endpoint — owner-share (only when mine) + pilot-share (always), normalized. */
function estimateAirportEndpoint(
  role: "dep" | "arr",
  icao: string,
  ev: MissionEvidence,
  licenceMedianByCode: Map<string, number>,
): ComponentEstimate {
  const key = role === "dep" ? "airport_dep" : "airport_arr";
  const label = role === "dep" ? "Departure airport" : "Arrival airport";
  const up = icao.toUpperCase();
  const own = ev.ownedIcaos.has(up);

  // Owner share: only my own flights matter — paxAirportOwn is the airport-owner slice.
  let ownerShare = 0;
  let ownerN = 0;
  if (own) {
    const myAtEndpoint = ev.ledger.myFlights.filter((f) =>
      role === "dep" ? f.originIcao === up : f.destIcao === up,
    );
   
    const visAtEndpoint = ev.ledger.visitorFlights.filter((v) =>
      role === "dep"
        ? (v.originIcao || "").toUpperCase() === up
        : (v.destIcao || "").toUpperCase() === up,
    );
    const values = [
      ...myAtEndpoint.map((r) => r.paxAirportOwn),
      ...visAtEndpoint.map((v) => v.paxAirport),
    ].filter((x) => x > 0);
    ownerN = values.length;
    ownerShare = values.length > 0 ? median(values) : 0;
  }

  // Pilot share: per-row, subtract that row's licence-median (0 if unknown) from
  // paxOther, halve to attribute to this endpoint side, then take the median
  // across the resulting per-flight values. Airport-only — no cross-endpoint mixing.
  const roleRows = ev.ledger.myFlights.filter((f) =>
    role === "dep" ? f.originIcao === up : f.destIcao === up,
  );
  const perFlightPilot: number[] = [];
  for (const f of roleRows) {
    const code = (f.licence || "").toUpperCase();
    const licenceRow = code ? (licenceMedianByCode.get(code) ?? 0) : 0;
    const airportPortion = Math.max(0, f.paxOther - licenceRow);
    perFlightPilot.push(airportPortion / 2);
  }
  const rawPilot = perFlightPilot.length > 0 ? median(perFlightPilot) : 0;
  // Normalize to current airport pilot payout % (confidence-weighted shrinkage).
  const cur = ev.currentAirportPilotPct.get(up);
  let pilotShare = rawPilot;
  let normalizedNote = "";
  if (cur !== undefined && rawPilot > 0) {
    const w = Math.min(1, perFlightPilot.length / 12);
    const scaled = rawPilot * (cur / ASSUMED_HIST_PILOT_PCT);
    pilotShare = rawPilot * w + scaled * (1 - w);
    if (Math.abs(pilotShare - rawPilot) > 0.01) {
      normalizedNote = ` Normalized ${rawPilot.toFixed(2)} → ${pilotShare.toFixed(2)} PAX (current pilot payout ${cur.toFixed(0)}%, ${perFlightPilot.length} sample${perFlightPilot.length === 1 ? "" : "s"}).`;
    }
  }

  const total = ownerShare + pilotShare;
  const sample = ownerN + perFlightPilot.length;
  let tier: ConfidenceTier;
  if (sample >= MIN_DIRECT * 2) tier = "direct";
  else if (sample >= MIN_NEAR * 2) tier = "near";
  else if (sample >= MIN_CLASS) tier = "class";
  else if (sample > 0) tier = "formula";
  else tier = "none";

    const baseNote = own
    ? `Owner share from ${ownerN} historical flights at ${up} + pilot share (${perFlightPilot.length} of my flights).`
    : `Pilot share from ${perFlightPilot.length} of my flights through ${up} (airport pilot cut only).`;

  return {
    key, label,
    value: total, ownerShare, pilotShare,
    sampleSize: sample, tier,
    confidence: confidenceFromTier(tier, sample),
    note: baseNote + normalizedNote,
  };
}

/** Licence component — full historical baseline (real historical averages already
 *  encode landing quality). */
function estimateLicenceComponent(
 inputs: MissionInputs,
 baseline: { value: number; sampleSize: number; tier: ConfidenceTier },
): ComponentEstimate {
 const code = (inputs.licence || "").trim().toUpperCase();
 if (!code) {
 return { key: "licence", label: "Licence income",
 value: 0, ownerShare: 0, pilotShare: 0,
 sampleSize: 0, tier: "none", confidence: 20,
 note: "No licence selected." };
 }
 // Zmieniamy przypisanie na pełną wartość baseline, bez dzielenia przez 2
 const value = baseline.value;
 return { key: "licence", label: "Licence income",
 value, ownerShare: 0, pilotShare: value,
 sampleSize: baseline.sampleSize,
 tier: baseline.tier,
 confidence: confidenceFromTier(baseline.tier, baseline.sampleSize),
 note: baseline.sampleSize > 0
  ? `Historical median: ${value.toFixed(2)} PAX across ${baseline.sampleSize} flights on ${code}.`
 : `No history on ${code} yet.` };
}

/** Weekly first-arrival ×3 detection.
 *  Depends only on: selected licence, arrival ICAO, current weekly window,
 *  and whether the licence has already landed at the arrival this week.
 *  Airport ownership is deliberately not considered. */
function estimateWeeklyBonus(
  inputs: MissionInputs,
  ev: MissionEvidence,
  licenceComponent: number,
): WeeklyBonus {
  const code = (inputs.licence || "").trim().toUpperCase();
  const arr = inputs.arrival.icao.toUpperCase();
  if (!code) {
    return { available: false, multiplier: WEEKLY_BONUS_MULTIPLIER, extraPax: 0,
      reason: "No licence selected — bonus not applicable." };
  }
  const { startMs, endMs } = ev.weeklyWindow;
  const usedThisWeek = ev.ledger.myFlights.some((f) => {
    if ((f.licence || "").toUpperCase() !== code) return false;
    if (f.destIcao !== arr) return false;
    const t = Date.parse(f.ts);
    return Number.isFinite(t) && t >= startMs && t <= endMs;
  });
  if (usedThisWeek) {
    return { available: false, multiplier: WEEKLY_BONUS_MULTIPLIER, extraPax: 0,
      reason: `Licence ${code} already landed at ${arr} this weekly cycle.` };
  }
 const extraPax = Math.max(0, licenceComponent * (WEEKLY_BONUS_MULTIPLIER - 1));
  return { available: true, multiplier: WEEKLY_BONUS_MULTIPLIER, extraPax,
    reason: `First landing this week for ${code} at ${arr} — ×${WEEKLY_BONUS_MULTIPLIER} on licence share.` };
}

// ---------- Assembler ----------

export function predictMission(inputs: MissionInputs, ev: MissionEvidence): MissionPrediction {
  const depUp = inputs.departure.icao.toUpperCase();
  const arrUp = inputs.arrival.icao.toUpperCase();
  const { spec } = lookupAircraftSpec(inputs.aircraftIcao);

  let distanceNm: number | null = null;
  let flightTimeMs: number | null = null;
  let cruiseKt: number | null = spec.cruiseKt;

  if (Number.isFinite(inputs.departure.lat) && Number.isFinite(inputs.departure.lon) &&
      Number.isFinite(inputs.arrival.lat)   && Number.isFinite(inputs.arrival.lon)) {
    distanceNm = haversineNm(
      { lat: inputs.departure.lat as number, lon: inputs.departure.lon as number },
      { lat: inputs.arrival.lat as number,   lon: inputs.arrival.lon as number },
    );
    const eta = computeEta({
      departureMs: Date.now(),
      origin: { lat: inputs.departure.lat as number, lon: inputs.departure.lon as number },
      destination: { lat: inputs.arrival.lat as number, lon: inputs.arrival.lon as number },
      aircraftICAO: inputs.aircraftIcao,
    });
    if (eta) { flightTimeMs = eta.durationMs; cruiseKt = eta.cruiseKt; }
  }

  const baseline = licenceBaseline(inputs, ev);
  const licenceMedianByCode = buildLicenceMedianMap(ev.ledger);
  const aircraft = estimateAircraftComponent(inputs, ev);
  const dep = estimateAirportEndpoint("dep", depUp, ev, licenceMedianByCode);
  const arr = estimateAirportEndpoint("arr", arrUp, ev, licenceMedianByCode);
  const licence = estimateLicenceComponent(inputs, baseline);
  const components = [aircraft, dep, arr, licence];

  const totalPax = components.reduce((s, c) => s + c.value, 0);
  const weeklyBonus = estimateWeeklyBonus(inputs, ev, licence.value);
  const projectedPax = totalPax + (weeklyBonus.available ? weeklyBonus.extraPax : 0);
  const flightTimeHours = flightTimeMs ? flightTimeMs / 3_600_000 : 0;
  const paxPerHour = flightTimeHours > 0 ? projectedPax / flightTimeHours : null;

  let overall = 0;
  if (totalPax > 0) {
    for (const c of components) overall += (c.value / totalPax) * c.confidence;
  } else overall = mean(components.map((c) => c.confidence));

  const signals: MissionSignal[] = [];
  if (distanceNm !== null && spec.rangeNm && distanceNm > spec.rangeNm) {
    signals.push({ key: "range", label: "Range warning",
      value: `${distanceNm.toFixed(0)} / ${spec.rangeNm} NM`, tone: "warn",
      hint: `${spec.model} typical range is ${spec.rangeNm} NM.` });
  }
  if (paxPerHour !== null) {
     signals.push({ key: "pph", label: "PAX / hour", value: paxPerHour.toFixed(2), tone: "neutral" });
  }
  const visitFreq = ev.frequentVisitorsAt.get(arrUp) ?? 0;
  if (visitFreq > 0) {
    signals.push({ key: "relationship", label: "Relationship",
      value: `${visitFreq} visit${visitFreq === 1 ? "" : "s"}`, tone: "positive",
      hint: "Pilot from this destination has flown to your airports." });
  }
  if (ev.ownedIcaos.has(depUp) && ev.ownedIcaos.has(arrUp)) {
    signals.push({ key: "hub_to_hub", label: "Hub-to-hub", value: "yes", tone: "positive",
      hint: "Both endpoints are yours — full airport-owner share on both sides." });
  }

  return {
    inputs, distanceNm, flightTimeMs, cruiseKt,
    totalPax, projectedPax, paxPerHour,
    overallConfidence: Math.round(overall),
    components, weeklyBonus, signals,
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
  currentAirportPilotPct?: Record<string, number>;
}): MissionEvidence {
  const ownedIcaos = new Set(args.ledger.ownedAirports.map((a) => a.icao.toUpperCase()));
  const ownedAircraftIds = new Set(args.ledger.ownedAircraft.map((a) => a.aircraftId));
  const aircraftIcaoById = new Map<string, string>(Object.entries(args.aircraftIcaoById));
  const currentAirportPilotPct = new Map<string, number>(
    Object.entries(args.currentAirportPilotPct ?? {}).map(([k, v]) => [k.toUpperCase(), v]),
  );

  const byPilot = new Map<string, number>();
  for (const v of args.ledger.visitorFlights) {
    if (!v.pilot) continue;
    byPilot.set(v.pilot, (byPilot.get(v.pilot) ?? 0) + 1);
  }
  const topPilots = new Set(
    Array.from(byPilot.entries()).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([p]) => p),
  );
  const frequentVisitorsAt = new Map<string, number>();
  for (const v of args.ledger.visitorFlights) {
    if (!v.pilot || !topPilots.has(v.pilot)) continue;
    for (const icao of [v.originIcao, v.destIcao]) {
      if (!icao) continue;
      const k = icao.toUpperCase();
      if (ownedIcaos.has(k)) continue;
      frequentVisitorsAt.set(k, (frequentVisitorsAt.get(k) ?? 0) + 1);
    }
  }

  return {
    ledger: args.ledger, ownedIcaos, ownedAircraftIds, aircraftIcaoById,
    frequentVisitorsAt, weeklyWindow: weeklyWindow(),
    currentAirportPilotPct,
  };
}

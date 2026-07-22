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

/** Sentinel aircraftId for the legacy single "Generic Plane" option (kept for backwards compat). */
export const GENERIC_AIRCRAFT_ID = "__generic__";
/** Prefix for tiered generic aircraft: __generic_t1__ … __generic_t7__. */
export const GENERIC_TIER_PREFIX = "__generic_t";
export const GENERIC_TIERS = [1, 2, 3, 4, 5, 6, 7] as const;
export function genericTierId(tier: number): string {
  return `${GENERIC_TIER_PREFIX}${tier}__`;
}
export function isGenericAircraftId(id: string | undefined | null): boolean {
  if (!id) return false;
  return id === GENERIC_AIRCRAFT_ID || id.startsWith(GENERIC_TIER_PREFIX);
}
export function genericTierFromId(id: string | undefined | null): number | undefined {
  if (!id || !id.startsWith(GENERIC_TIER_PREFIX)) return undefined;
  const m = id.match(/^__generic_t(\d+)__$/);
  return m ? Number(m[1]) : undefined;
}

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

export type WeeklyBonusPart = {
  role: "dep" | "arr";
  icao: string;
  eligible: boolean;
  ownedByMe: boolean;
  value: number;                 // PAX added by this endpoint
  sampleSize: number;
  tier: ConfidenceTier;
  reason: string;
  source: "historical" | "fallback" | "owned" | "not-eligible" | "no-licence";
};

export type WeeklyBonus = {
  available: boolean;
  multiplier: number;      // 2 — spec: base × 2
  extraPax: number;        // depBonus + arrBonus
  reason: string;
  departure: WeeklyBonusPart;
  arrival: WeeklyBonusPart;
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

export type MatrixCell = { avgPax: number; count: number };
/** key = `${aircraftCat}:${airportCat}` */
export type TierMatrix = Map<string, MatrixCell>;

export type MissionEvidence = {
  ledger: IncomeLedger;
  ownedIcaos: Set<string>;
  ownedAircraftIds: Set<string>;
  aircraftIcaoById: Map<string, string>;
  /** SimFly category (1..6) by aircraftId — merged from owned + rentals when known. */
  aircraftCatById: Map<string, number>;
  /** SimFly category (1..6) by airport ICAO — owned + fetched endpoints. */
  airportCatByIcao: Map<string, number>;
  /** Reference matrices keyed `${aircraftCat}:${airportCat}` */
  airportOwnerMatrix: { dep: TierMatrix; arr: TierMatrix };
  airportPilotMatrix: { dep: TierMatrix; arr: TierMatrix };
  aircraftOwnerMatrix: TierMatrix;
  /** Optional community-derived airport matrices (dep/arr), from all pilots' flights. */
  communityAirportMatrix?: { dep: TierMatrix; arr: TierMatrix };
  /** Whether community evidence should be blended into predictions. */
  useCommunity?: boolean;
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
const WEEKLY_BONUS_MULTIPLIER = 2; // Weekly First-Arrival bonus = base airport × 2
const WEEKLY_BONUS_FLAT_FALLBACK = 0.35; // PAX per eligible endpoint when no history
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

/** Aircraft-owner slice — full amount when I own the plane, else 0.
 *  Iteration 5: direct/near/class → aircraft reference matrix → 0/formula. */
function estimateAircraftComponent(
  inputs: MissionInputs,
  ev: MissionEvidence,
): ComponentEstimate {
  const acId = inputs.aircraftId;

  // 1. Zabezpieczenie dla Generic Plane
  if (isGenericAircraftId(acId)) {
    return {
      key: "aircraft", label: "Aircraft owner income",
      value: 0, ownerShare: 0, pilotShare: 0,
      sampleSize: 0, tier: "none", confidence: 100,
      note: "Generic plane — planning only. Aircraft income = 0.00.",
    };
  }

  // 2. Filtrujemy historię lotów dla tego unikalnego samolotu
  const ownRows = ev.ledger.myFlights.filter((f) => {
    const rowAircraftId = f.aircraftId || (f as any).aircraft_id;
    return rowAircraftId === acId;
  });

  const dep = inputs.departure.icao.toUpperCase();
  const arr = inputs.arrival.icao.toUpperCase();

  // --- PARSOWANIE ORYGINALNEGO JSONA Z BAZY (Kolumna raw) ---
  // W ten sposób wyciągamy czystą, historyczną wartość 0.34 dla samej Cessny!
  const getTrueAircraftPax = (f: any) => {
    try {
      const rawString = f.raw || (f as any).raw;
      if (!rawString) return 0;
      
      // Jeśli to jest string, parsujemy do obiektu. Jeśli już obiekt, bierzemy bezpośrednio.
      const parsed = typeof rawString === 'string' ? JSON.parse(rawString) : rawString;
      
      // Dobieramy się do struktury dokładnie tak, jak zapisało to SimFly:
      return Number(parsed?.airplane?.pax ?? parsed?.airplane?.earnedPax ?? 0);
    } catch {
      return 0;
    }
  };

  // --- OBLIChENIA ŚCIEŻKI: NEAR (Dowolny korytarz dla tego samolotu) ---
  const values = ownRows.map(getTrueAircraftPax).filter(v => v > 0);

  if (values.length > 0) {
    const calculatedMed = median(values);
    
    return { 
      key: "aircraft", label: "Aircraft owner income",
      value: calculatedMed, 
      ownerShare: calculatedMed, // Wymuszamy przypisanie zysku właściciela, by filtr go nie skasował
      pilotShare: 0,
      sampleSize: values.length, 
      tier: "near",
      confidence: 100,
      note: `Median across ${values.length} flights directly from raw SimFly telemetry.` 
    };
  }

  return { 
    key: "aircraft", label: "Aircraft owner income",
    value: 0, ownerShare: 0, pilotShare: 0,
    sampleSize: 0, tier: "none", confidence: 0,
    note: "No historical flights with raw telemetry found for this aircraft." 
  };
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

/** Airport endpoint — owner-share (only when mine) + pilot-share (always), normalized.
 *  Iteration 5: adds reference-matrix fallback for both owner and pilot slices. */
function estimateAirportEndpoint(
  role: "dep" | "arr",
  icao: string,
  inputs: MissionInputs,
  ev: MissionEvidence,
  licenceMedianByCode: Map<string, number>,
): ComponentEstimate {
  const key = role === "dep" ? "airport_dep" : "airport_arr";
  const label = role === "dep" ? "Departure airport" : "Arrival airport";
  const up = icao.toUpperCase();
  const own = ev.ownedIcaos.has(up);

  // Aircraft category for matrix lookups (generic tiered aircraft supply their own tier).
  const acId = inputs.aircraftId;
  const genericTier = genericTierFromId(acId);
  const acCat = genericTier
    ?? (inputs.aircraftTier
      ?? (acId && !isGenericAircraftId(acId) ? ev.aircraftCatById.get(acId) : undefined)
      ?? lookupAircraftSpec((inputs.aircraftIcao || "").toUpperCase())?.spec?.category);
  const apCat = ev.airportCatByIcao.get(up);
  const ownerMatrix = role === "dep" ? ev.airportOwnerMatrix.dep : ev.airportOwnerMatrix.arr;
  const pilotMatrix = role === "dep" ? ev.airportPilotMatrix.dep : ev.airportPilotMatrix.arr;
  const commMatrix = ev.useCommunity && ev.communityAirportMatrix
    ? (role === "dep" ? ev.communityAirportMatrix.dep : ev.communityAirportMatrix.arr)
    : undefined;

  // Owner share: only my own flights matter — paxAirportOwn is the airport-owner slice.
  let ownerShare = 0;
  let ownerN = 0;
  let ownerNote = "";
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
    if (values.length > 0) {
      ownerShare = median(values);
      ownerNote = `Owner share from ${ownerN} historical flights at ${up}.`;
    } else {
      const cell = matrixLookup(ownerMatrix, acCat, apCat);
      if (cell) {
        ownerShare = cell.avgPax;
        ownerN = cell.count;
        ownerNote = `Owner share from reference matrix (aircraft T${acCat} × airport T${apCat}, ${cell.count} flights).`;
      }
    }
  }

  // Pilot share: per-row residual (paxOther − licence baseline) / 2 per endpoint side.
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
  let rawPilot = perFlightPilot.length > 0 ? median(perFlightPilot) : 0;
  let pilotSample = perFlightPilot.length;
  let pilotSourceNote = `Pilot share from ${perFlightPilot.length} of my flights through ${up}.`;

  // Matrix fallback when there is no direct history at this endpoint.
  if (perFlightPilot.length === 0) {
    const cell = matrixLookup(pilotMatrix, acCat, apCat);
    if (cell) {
      rawPilot = cell.avgPax;
      pilotSample = cell.count;
      pilotSourceNote = `Pilot share from reference matrix (aircraft T${acCat} × airport T${apCat}, ${cell.count} flights).`;
    }
  }

  // Community Intelligence blend — supplementary evidence, never inflates confidence.
  let communityBlend = 0;
  let communityNote = "";
  if (commMatrix) {
    const commCell = matrixLookup(commMatrix, acCat, apCat);
    if (commCell) {
      const own = perFlightPilot.length;
      const w = Math.min(0.40, Math.max(0.05, 1 / (1 + own / 5)));
      const before = rawPilot;
      rawPilot = rawPilot * (1 - w) + commCell.avgPax * w;
      communityBlend = w;
      communityNote = ` Community blend ${(w * 100).toFixed(0)}%: ${before.toFixed(2)} → ${rawPilot.toFixed(2)} PAX from ${commCell.count} community flights.`;
    }
  }

  // Normalize to current airport pilot payout % (confidence-weighted shrinkage).
  const cur = ev.currentAirportPilotPct.get(up);
  let pilotShare = rawPilot;
  let normalizedNote = "";
  if (cur !== undefined && rawPilot > 0) {
    const w = Math.min(1, pilotSample / 12);
    const scaled = rawPilot * (cur / ASSUMED_HIST_PILOT_PCT);
    pilotShare = rawPilot * w + scaled * (1 - w);
    if (Math.abs(pilotShare - rawPilot) > 0.01) {
      normalizedNote = ` Normalized ${rawPilot.toFixed(2)} → ${pilotShare.toFixed(2)} PAX (current pilot payout ${cur.toFixed(0)}%, ${pilotSample} sample${pilotSample === 1 ? "" : "s"}).`;
    }
  }

  const total = ownerShare + pilotShare;
  const sample = ownerN + pilotSample;
  let tier: ConfidenceTier;
  if (sample >= MIN_DIRECT * 2) tier = "direct";
  else if (sample >= MIN_NEAR * 2) tier = "near";
  else if (sample >= MIN_CLASS) tier = "class";
  else if (sample > 0) tier = "formula";
  else tier = "none";

  const baseNote = (ownerNote ? ownerNote + " " : "") + pilotSourceNote;

  return {
    key, label,
    value: total, ownerShare, pilotShare,
    sampleSize: sample, tier,
    confidence: confidenceFromTier(tier, sample),
    note: baseNote + normalizedNote + communityNote,
  };
}

/** Weekly First-Arrival bonus — value = base airport component × 2 per eligible endpoint. */
function weeklyPart(
  role: "dep" | "arr",
  icao: string,
  code: string,
  ev: MissionEvidence,
  airportComp: ComponentEstimate,
): WeeklyBonusPart {
  const up = icao.toUpperCase();
  if (!code) {
    return { role, icao: up, eligible: false, ownedByMe: ev.ownedIcaos.has(up),
      value: 0, sampleSize: 0, tier: "none",
      reason: "No licence selected.", source: "no-licence" };
  }
  const ownedByMe = ev.ownedIcaos.has(up);
  if (ownedByMe) {
    return { role, icao: up, eligible: false, ownedByMe: true,
      value: 0, sampleSize: 0, tier: "none",
      reason: `${up} is your airport — bonus not applicable.`, source: "owned" };
  }
  const { startMs, endMs } = ev.weeklyWindow;
  const usedThisWeek = ev.ledger.myFlights.some((f) => {
    if ((f.licence || "").toUpperCase() !== code) return false;
    const hit = role === "dep" ? f.originIcao === up : f.destIcao === up;
    if (!hit) return false;
    const t = Date.parse(f.ts);
    return Number.isFinite(t) && t >= startMs && t <= endMs;
  });
  if (usedThisWeek) {
    return { role, icao: up, eligible: false, ownedByMe: false,
      value: 0, sampleSize: 0, tier: "none",
      reason: `Licence ${code} already flew through ${up} this weekly cycle.`,
      source: "not-eligible" };
  }
  if (airportComp.sampleSize > 0 && airportComp.value > 0) {
    return { role, icao: up, eligible: true, ownedByMe: false,
      value: airportComp.value * WEEKLY_BONUS_MULTIPLIER,
      sampleSize: airportComp.sampleSize,
      tier: airportComp.tier,
      reason: `Base ${airportComp.value.toFixed(2)} × ${WEEKLY_BONUS_MULTIPLIER} from ${airportComp.sampleSize} historical flights.`,
      source: "historical" };
  }
  return { role, icao: up, eligible: true, ownedByMe: false,
    value: WEEKLY_BONUS_FLAT_FALLBACK,
    sampleSize: 0, tier: "formula",
    reason: `Flat fallback — no historical evidence at ${up}.`,
    source: "fallback" };
}

function assembleWeeklyBonus(
  inputs: MissionInputs,
  ev: MissionEvidence,
  depComp: ComponentEstimate,
  arrComp: ComponentEstimate,
): WeeklyBonus {
  const code = (inputs.licence || "").trim().toUpperCase();
  const dep = weeklyPart("dep", inputs.departure.icao, code, ev, depComp);
  const arr = weeklyPart("arr", inputs.arrival.icao, code, ev, arrComp);
  const available = dep.eligible || arr.eligible;
  const extraPax = dep.value + arr.value;
  const reason = !code
    ? "No licence selected — bonus not applicable."
    : available
      ? `Weekly bonus eligible at ${[dep.eligible ? dep.icao : null, arr.eligible ? arr.icao : null].filter(Boolean).join(" & ")}.`
      : "Weekly bonus not available for this movement.";
  return {
    available,
    multiplier: WEEKLY_BONUS_MULTIPLIER,
    extraPax,
    reason,
    departure: dep,
    arrival: arr,
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

// (Legacy estimateWeeklyBonus removed — see weeklyPart/assembleWeeklyBonus above.)

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
  const dep = estimateAirportEndpoint("dep", depUp, inputs, ev, licenceMedianByCode);
  const arr = estimateAirportEndpoint("arr", arrUp, inputs, ev, licenceMedianByCode);
  const licence = estimateLicenceComponent(inputs, baseline);
  const components = [aircraft, dep, arr, licence];

  const totalPax = components.reduce((s, c) => s + c.value, 0);
  const weeklyBonus = assembleWeeklyBonus(inputs, ev, dep, arr);
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

// ---------- Matrix builders (Iteration 5) ----------

const MATRIX_MIN_SAMPLE = 3;

function matrixKey(aircraftCat: number, airportCat: number): string {
  return `${aircraftCat}:${airportCat}`;
}

function reduceToCell(values: number[]): MatrixCell {
  if (values.length === 0) return { avgPax: 0, count: 0 };
  return { avgPax: median(values), count: values.length };
}

function buildMatrices(args: {
  ledger: IncomeLedger;
  aircraftCatById: Map<string, number>;
  airportCatByIcao: Map<string, number>;
  ownedIcaos: Set<string>;
  licenceMedianByCode: Map<string, number>;
}): {
  airportOwnerMatrix: { dep: TierMatrix; arr: TierMatrix };
  airportPilotMatrix: { dep: TierMatrix; arr: TierMatrix };
  aircraftOwnerMatrix: TierMatrix;
} {
  const ownerDep = new Map<string, number[]>();
  const ownerArr = new Map<string, number[]>();
  const pilotDep = new Map<string, number[]>();
  const pilotArr = new Map<string, number[]>();
  const aircraftBuckets = new Map<string, number[]>();

  const push = (m: Map<string, number[]>, k: string, v: number) => {
    let a = m.get(k);
    if (!a) { a = []; m.set(k, a); }
    a.push(v);
  };

  for (const f of args.ledger.myFlights) {
    if (!f.aircraftId) continue;
    const acCat = args.aircraftCatById.get(f.aircraftId);
    if (acCat === undefined) continue;

    const depCat = args.airportCatByIcao.get(f.originIcao?.toUpperCase() ?? "");
    const arrCat = args.airportCatByIcao.get(f.destIcao?.toUpperCase() ?? "");

    // Aircraft-owner matrix — only when I owned the plane
    if (f.ownAircraft && f.paxAircraftOwn > 0) {
      // Bucket by any endpoint tier available (dep preferred, else arr).
      const endpointCat = depCat ?? arrCat;
      if (endpointCat !== undefined) {
        push(aircraftBuckets, matrixKey(acCat, endpointCat), f.paxAircraftOwn);
      }
    }

    // Airport OWNER matrices — only when I own the endpoint
    if (depCat !== undefined && f.ownOrigin && f.paxAirportOwn > 0) {
      push(ownerDep, matrixKey(acCat, depCat), f.paxAirportOwn);
    }
    if (arrCat !== undefined && f.ownDest && f.paxAirportOwn > 0) {
      push(ownerArr, matrixKey(acCat, arrCat), f.paxAirportOwn);
    }

    // Airport PILOT matrices — per-flight residual, split /2 across endpoints.
    const licCode = (f.licence || "").toUpperCase();
    const licRow = licCode ? (args.licenceMedianByCode.get(licCode) ?? 0) : 0;
    const airportPortion = Math.max(0, f.paxOther - licRow);
    const halfPilot = airportPortion / 2;
    if (halfPilot > 0) {
      if (depCat !== undefined) push(pilotDep, matrixKey(acCat, depCat), halfPilot);
      if (arrCat !== undefined) push(pilotArr, matrixKey(acCat, arrCat), halfPilot);
    }
  }

  const toMatrix = (m: Map<string, number[]>): TierMatrix => {
    const out: TierMatrix = new Map();
    for (const [k, xs] of m) out.set(k, reduceToCell(xs));
    return out;
  };

  return {
    airportOwnerMatrix: { dep: toMatrix(ownerDep), arr: toMatrix(ownerArr) },
    airportPilotMatrix: { dep: toMatrix(pilotDep), arr: toMatrix(pilotArr) },
    aircraftOwnerMatrix: toMatrix(aircraftBuckets),
  };
}

// ---------- Evidence builder ----------

export function buildEvidence(args: {
  ledger: IncomeLedger;
  aircraftIcaoById: Record<string, string>;
  aircraftCatById?: Record<string, number>;
  airportCatByIcao?: Record<string, number>;
  currentAirportPilotPct?: Record<string, number>;
}): MissionEvidence {
  const ownedIcaos = new Set(args.ledger.ownedAirports.map((a) => a.icao.toUpperCase()));
  const ownedAircraftIds = new Set(args.ledger.ownedAircraft.map((a) => a.aircraftId));
  const aircraftIcaoById = new Map<string, string>(Object.entries(args.aircraftIcaoById));

  // Derive aircraft category from ICAO when not explicitly provided.
  const aircraftCatById = new Map<string, number>();
  for (const [id, cat] of Object.entries(args.aircraftCatById ?? {})) {
    if (Number.isFinite(cat)) aircraftCatById.set(id, cat);
  }
  for (const [id, icao] of aircraftIcaoById) {
    if (aircraftCatById.has(id)) continue;
    const spec = lookupAircraftSpec(icao)?.spec;
    if (spec && Number.isFinite(spec.category)) aircraftCatById.set(id, spec.category);
  }

  const airportCatByIcao = new Map<string, number>(
    Object.entries(args.airportCatByIcao ?? {})
      .filter(([, v]) => Number.isFinite(v))
      .map(([k, v]) => [k.toUpperCase(), v]),
  );

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

  const licenceMedianByCode = buildLicenceMedianMap(args.ledger);
  const matrices = buildMatrices({
    ledger: args.ledger,
    aircraftCatById,
    airportCatByIcao,
    ownedIcaos,
    licenceMedianByCode,
  });

  return {
    ledger: args.ledger,
    ownedIcaos,
    ownedAircraftIds,
    aircraftIcaoById,
    aircraftCatById,
    airportCatByIcao,
    airportOwnerMatrix: matrices.airportOwnerMatrix,
    airportPilotMatrix: matrices.airportPilotMatrix,
    aircraftOwnerMatrix: matrices.aircraftOwnerMatrix,
    frequentVisitorsAt,
    weeklyWindow: weeklyWindow(),
    currentAirportPilotPct,
  };
}

/** Look up a matrix cell for aircraftCat × airportCat with sample-size floor. */
export function matrixLookup(
  matrix: TierMatrix,
  aircraftCat: number | undefined,
  airportCat: number | undefined,
): MatrixCell | null {
  if (aircraftCat === undefined || airportCat === undefined) return null;
  const cell = matrix.get(matrixKey(aircraftCat, airportCat));
  if (!cell || cell.count < MATRIX_MIN_SAMPLE) return null;
  return cell;
}

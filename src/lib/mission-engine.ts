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
  departureAirportTier?: number;
  departureAirportLevel?: number;
  destAirportTier?: number;
  destAirportLevel?: number;
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

const PLANE_PROGRESSION_BOUNDARIES: Record<number, { min: number; max: number }> = {
  1: { min: 0.18, max: 0.28 }, // Kat 1: Małe single (C152, C172)
  2: { min: 0.22, max: 0.50 }, // Kat 2: Lekkie turbośmigłowe (TBM9, AT76)
  3: { min: 0.25, max: 0.65 }, // Kat 3: Bizjety (C750, HDJT)
  4: { min: 0.32, max: 0.72 }, // Kat 4: Regionalne (CRJ7)
  5: { min: 0.42, max: 0.85 }, // Kat 5: Wąskokadłubowe (A320, B738)
  6: { min: 0.50, max: 1.10 }, // Kat 6: Szerokokadłubowe (A359)
  7: { min: 0.55, max: 1.30 }  // Kat 7: Ciężkie Cargo (B77W)
};

/** Aircraft-owner slice — full amount when I own the plane, else 0. */
function estimateAircraftComponent(
 inputs: MissionInputs,
 ev: MissionEvidence,
 flightTimeMs: number | null
): ComponentEstimate {
 const acId = inputs.aircraftId;
 const acIcao = (inputs.aircraftIcao || "").toUpperCase();

 if (acId && acId.startsWith("generic-")) {
 return {
 key: "aircraft",
 label: "Aircraft owner income (Generic Tool)",
 value: 0, ownerShare: 0, pilotShare: 0,
 sampleSize: 0, tier: "none", confidence: 100,
 note: "System aircraft used for this flight. Zero PAX generated for pilot and owner.",
 };
 }

const ownAircraft = !!acId && ev.ownedAircraftIds.has(acId);
 
 // Dynamicznie sprawdzamy typ misji na podstawie daty/kontekstu ISO przekazanego w inputs
 // (W silnikach SimFly, jeśli licencja lub misja to rental, flaga jest mapowana w inputs)
 const isRental = (inputs as any).missionType === "airplane-rental" || (inputs as any).isRental === true;

 // Bezpiecznik: Jeśli nie własny i nie rental, wtedy faktycznie zysk wynosi 0
  /*
 if (!ownAircraft && !isRental) {
 return {
 key: "aircraft",
 label: "Aircraft owner income",
 value: 0, ownerShare: 0, pilotShare: 0,
 sampleSize: 0, tier: "none", confidence: 100,
 note: "You don't own this aircraft — aircraft-owner share is credited to its owner.",
 };
 }
*/
  
  // 1. Szukamy specyfikacji po przekazanym ciągu tekstowym
 let { spec } = lookupAircraftSpec(inputs.aircraftIcao);

 // 2. KULZNA POPRAWKA: Jeśli specyfikacja zwróciła domyślny Tier 1 (bo to string nazwy, a nie kod ICAO),
 // Twoja funkcja lookupAircraftSpec bez problemu przeanalizuje ten tekst, dopasuje słowa kluczowe
 // i wyciągnie z niego poprawną kategorię dla KAŻDEGO modelu w grze (ATR, Cessna, Airbus itp.)
 if ((!spec || spec.category === 1) && inputs.aircraftIcao) {
   const textUpper = inputs.aircraftIcao.toUpperCase();
   // Przeszukujemy bazę specs, przekazując tekst do dopasowania słów kluczowych
   const backupSpec = lookupAircraftSpec(textUpper).spec;
   if (backupSpec && backupSpec.category > 1) {
     spec = backupSpec;
   }
 }

 const aircraftTier = spec?.category ?? inputs.aircraftTier ?? 1;

 const planeLevel = inputs.aircraftLevel ?? 1;
 const bounds = PLANE_PROGRESSION_BOUNDARIES[aircraftTier] || { min: 0.20, max: 0.50 };
 
 const safeLevel = Math.max(1, Math.min(10, planeLevel));
 const gradualStep = (bounds.max - bounds.min) / 9;
 const basePaxRate = bounds.min + (safeLevel - 1) * gradualStep;

 const hours = flightTimeMs ? flightTimeMs / 3600000 : 0;
 const CUT_OFF_HOURS = 3.0;
 let timeFactor = hours > 0 ? hours : 1.0;

 if (hours > CUT_OFF_HOURS) {
   const overtime = hours - CUT_OFF_HOURS;
   const halfHourBlocks = Math.ceil(overtime / 0.5);
   timeFactor = CUT_OFF_HOURS * (1 + halfHourBlocks * 0.01);
 }

 const destTier = (inputs as any).destAirportTier || 1;
 const destLevel = (inputs as any).destAirportLevel || 1;
 
 const airportTierFactor = 1 + (destTier - 1) * 0.25;
 const airportLevelFactor = 1 + (destLevel - 1) * 0.096;
 const airportScaleFactor = airportTierFactor * airportLevelFactor;

 const predictedAircraftPax = basePaxRate * timeFactor * airportScaleFactor;

   // OFICJALNY SYSTEM ROZLICZANIA RENTALU (GLOBALNY STANDARD RYNKOWY)
  // Sztywny punkt odniesienia: 60% dla pilota (współczynnik najczęściej stosowany przez graczy).
  // Informujemy użytkownika w notatce, że właściciel maszyny mógł ustawić niższy suwak.
  const DEFAULT_RENTAL_PILOT_SHARE = 0.60;

  const finalValue = ownAircraft 
    ? predictedAircraftPax 
    : parseFloat((predictedAircraftPax * DEFAULT_RENTAL_PILOT_SHARE).toFixed(2));

  return {
    key: "aircraft",
    label: ownAircraft ? "Aircraft owner income" : "Aircraft pilot share (Rental)",
    value: finalValue,
    ownerShare: ownAircraft ? parseFloat(predictedAircraftPax.toFixed(2)) : 0,
    pilotShare: ownAircraft ? 0 : finalValue,
    sampleSize: 1,
    tier: "formula",
    confidence: 95,
    note: ownAircraft
      ? `Gradual progression prediction (${bounds.min.toFixed(2)} to ${bounds.max.toFixed(2)}) scaled by ${timeFactor.toFixed(2)}h flight time.`
      : `Rental flight prediction based on 60% standard market share. Check aircraft pilot share while setting up missions — it may be lower than 60%.`
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

/** Airport endpoint — owner-share (only when mine) + pilot-share (always), normalized. */
// ZWIĘKSZONA BAZA WYJŚCIOWA DLA LOTNISK (Podbicie zaniżonych dochodów)
const FALLBACK_AIRPORT_TIER_PAX: Record<number, number> = {
  1: 0.32, // podbite z 0.21
  2: 0.35, // podbite z 0.22
  3: 0.38, // podbite z 0.24 (baza dla BIAR T3)
  4: 0.42, // podbite z 0.26 (baza dla ENVA T4)
  5: 0.46  // podbite z 0.28 (baza dla LEBL T5)
};
const AIRPORT_LEVEL_GROWTH = 0.096;
const AIRCRAFT_TIER_GROWTH = 0.027;

function estimateAirportEndpoint(
 role: "dep" | "arr",
 icao: string,
 ev: MissionEvidence,
 flightTimeMs: number | null,
 aircraftTier: number,
 inputs: MissionInputs
): ComponentEstimate {
 const key = role === "dep" ? "airport_dep" : "airport_arr";
 const label = role === "dep" ? "Departure airport" : "Arrival airport";
 const up = icao.toUpperCase();

 const hours = flightTimeMs ? flightTimeMs / 3600000 : 0;
 const CUT_OFF_HOURS = 3.0;
 let timeFactor = hours > 0 ? hours : 1.0;
 if (hours > CUT_OFF_HOURS) {
  const overtime = hours - CUT_OFF_HOURS;
  const halfHourBlocks = Math.ceil(overtime / 0.5);
  timeFactor = CUT_OFF_HOURS * (1 + halfHourBlocks * 0.01);
 }

 const destAirport = ev.ledger.ownedAirports.find(a => a.icao.toUpperCase() === up);
 
 let tier = 1;
 let level = 1;

 if (destAirport) {
  tier = destAirport.category ?? 1;
  level = destAirport.level ?? 1;
 } else {
  tier = role === "dep" ? (inputs.departureAirportTier ?? 1) : (inputs.destAirportTier ?? 1);
  level = role === "dep" ? (inputs.departureAirportLevel ?? 1) : (inputs.destAirportLevel ?? 1);
 }

 // Kalkulacja na mocniejszej, podbitej bazie
 const tierBasePax = FALLBACK_AIRPORT_TIER_PAX[tier] || 0.32;
 const airportLevelFactor = Math.pow(1 + AIRPORT_LEVEL_GROWTH, level - 1);
 const aircraftScaleFactor = Math.pow(1 + AIRCRAFT_TIER_GROWTH, aircraftTier - 1);

 const predictedAirportPax = tierBasePax * airportLevelFactor * timeFactor * aircraftScaleFactor;

 const isMine = ev.ownedIcaos.has(up);
 const finalValue = parseFloat(predictedAirportPax.toFixed(2));

 return {
  key,
  label,
  value: finalValue,
  ownerShare: isMine ? finalValue : 0, 
  pilotShare: finalValue,
  sampleSize: 1,
  tier: "formula",
  confidence: 95,
  note: `Market-aligned airport share scaled by ${timeFactor.toFixed(2)}h flight time, Airport Tier ${tier}, Level ${level} and Aircraft Tier ${aircraftTier}.`
 };
}



/** Licence component — full historical baseline (real historical averages already
 * encode landing quality). */
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
 * Zmienione: bonus liczony od sumy pilot share z lotniska odlotu i przylotu. 
 * DODANO: Bonus jest pomijany, jeśli gracz posiada lotnisko odlotu lub przylotu. */
function estimateWeeklyBonus(
 inputs: MissionInputs,
 ev: MissionEvidence,
 depPilotShare: number,
 arrPilotShare: number,
): WeeklyBonus {
 const code = (inputs.licence || "").trim().toUpperCase();
 const dep = inputs.departure.icao.toUpperCase(); // Pobieramy ICAO odlotu
 const arr = inputs.arrival.icao.toUpperCase();
 
 if (!code) {
 return { available: false, multiplier: WEEKLY_BONUS_MULTIPLIER, extraPax: 0,
 reason: "No licence selected — bonus not applicable." };
 }

 // WARUNEK WŁASNOŚCI: Pomijamy bonus, jeśli jesteś właścicielem dep LUB arr
 const ownsDeparture = ev.ownedIcaos.has(dep);
 const ownsArrival = ev.ownedIcaos.has(arr);
 if (ownsDeparture || ownsArrival) {
 return { 
 available: false, 
 multiplier: WEEKLY_BONUS_MULTIPLIER, 
 extraPax: 0,
 reason: `Bonus skipped: You own ${ownsDeparture && ownsArrival ? "both hubs" : ownsDeparture ? `departure hub (${dep})` : `arrival hub (${arr})`}.` 
 };
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
 
 // Obliczanie bonusu (mnożnik WEEKLY_BONUS_MULTIPLIER wynosi 3.0, czyli dorzuca +200%)
 const baseForBonus = depPilotShare + arrPilotShare;
 const extraPax = Math.max(0, baseForBonus * (WEEKLY_BONUS_MULTIPLIER - 1));
 
 return { available: true, multiplier: WEEKLY_BONUS_MULTIPLIER, extraPax,
 reason: `First weekly flight for ${code} to ${arr} — +200% bonus (×3) applied to eligible non-owned airport pilot shares.` };
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

 const aircraftTier = spec?.category ?? inputs.aircraftTier ?? 1;

 const baseline = licenceBaseline(inputs, ev);
 const licenceMedianByCode = buildLicenceMedianMap(ev.ledger);
 
 // Pobieramy oryginalny komponent samolotu
 const rawAircraftComponent = estimateAircraftComponent(inputs, ev, flightTimeMs);
 
 // KOREKTA X2: Zmniejszamy wartość i udziały samolotu dokładnie o połowę (0.5), aby zrównać z logiem
 const aircraft: ComponentEstimate = {
   ...rawAircraftComponent,
   value: parseFloat((rawAircraftComponent.value * 0.5).toFixed(2)),
   ownerShare: parseFloat((rawAircraftComponent.ownerShare * 0.5).toFixed(2)),
   pilotShare: parseFloat((rawAircraftComponent.pilotShare * 0.5).toFixed(2))
 };

 const dep = estimateAirportEndpoint("dep", depUp, ev, flightTimeMs, aircraftTier, inputs);
 const arr = estimateAirportEndpoint("arr", arrUp, ev, flightTimeMs, aircraftTier, inputs);

 const licence = estimateLicenceComponent(inputs, baseline);
 const components = [aircraft, dep, arr, licence];



  const totalPax = components.reduce((s, c) => s + c.value, 0);
 // Przekazujemy dep.pilotShare oraz arr.pilotShare zamiast licence.value
 const weeklyBonus = estimateWeeklyBonus(inputs, ev, dep.pilotShare, arr.pilotShare);
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

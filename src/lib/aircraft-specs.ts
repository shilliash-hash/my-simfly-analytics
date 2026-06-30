// Aircraft cruise specs lookup. Used by the ETA engine.
// Keys are SimFly aircraftICAO codes (or close variants). Speeds in knots TAS,
// range in NM, pax = passenger capacity. This list is intentionally read-only
// and lightweight — extend as new aircraft appear. A safe default is returned
// for unknown types so ETA always renders.

export interface AircraftSpec {
  icao: string;
  model: string;
  category: number; // SimFly category tier (1..6, rough)
  cruiseKt: number; // knots true airspeed at typical cruise
  rangeNm: number;
  pax: number;
}

const SPECS: AircraftSpec[] = [
  // GA singles / light
  { icao: "C172", model: "Cessna 172",            category: 1, cruiseKt: 122, rangeNm: 640,  pax: 3 },
  { icao: "C152", model: "Cessna 152",            category: 1, cruiseKt: 107, rangeNm: 415,  pax: 1 },
  { icao: "DA40", model: "Diamond DA40",          category: 1, cruiseKt: 150, rangeNm: 720,  pax: 3 },
  { icao: "DA62", model: "Diamond DA62",          category: 2, cruiseKt: 192, rangeNm: 1283, pax: 6 },
  { icao: "SR22", model: "Cirrus SR22",           category: 2, cruiseKt: 183, rangeNm: 1170, pax: 3 },
  { icao: "P28A", model: "Piper PA-28",           category: 1, cruiseKt: 125, rangeNm: 522,  pax: 3 },

  // Turboprops
  { icao: "TBM9", model: "Daher TBM 930",         category: 3, cruiseKt: 330, rangeNm: 1730, pax: 5 },
  { icao: "TBM930", model: "Daher TBM 930",       category: 3, cruiseKt: 330, rangeNm: 1730, pax: 5 },
  { icao: "PC12", model: "Pilatus PC-12",         category: 3, cruiseKt: 280, rangeNm: 1845, pax: 9 },
  { icao: "KODI", model: "Kodiak 100",            category: 2, cruiseKt: 174, rangeNm: 1132, pax: 9 },
  { icao: "C208", model: "Cessna 208 Caravan",    category: 2, cruiseKt: 186, rangeNm: 964,  pax: 9 },
  { icao: "AT75", model: "ATR 72-500",            category: 4, cruiseKt: 275, rangeNm: 825,  pax: 70 },
  { icao: "DH8D", model: "Bombardier Dash 8 Q400",category: 4, cruiseKt: 360, rangeNm: 1100, pax: 78 },

  // Light/midsize jets
  { icao: "C700", model: "Cessna Citation Longitude", category: 4, cruiseKt: 476, rangeNm: 3500, pax: 12 },
  { icao: "C750", model: "Citation X",            category: 4, cruiseKt: 527, rangeNm: 3460, pax: 12 },
  { icao: "C25C", model: "Citation CJ4",          category: 3, cruiseKt: 451, rangeNm: 2165, pax: 9 },
  { icao: "C68A", model: "Citation Latitude",     category: 4, cruiseKt: 446, rangeNm: 2700, pax: 9 },
  { icao: "GLF6", model: "Gulfstream G650",       category: 5, cruiseKt: 488, rangeNm: 7000, pax: 18 },

  // Narrowbody
  { icao: "A20N", model: "Airbus A320neo",        category: 5, cruiseKt: 447, rangeNm: 3500, pax: 180 },
  { icao: "A319", model: "Airbus A319",           category: 5, cruiseKt: 447, rangeNm: 3700, pax: 156 },
  { icao: "A320", model: "Airbus A320",           category: 5, cruiseKt: 447, rangeNm: 3300, pax: 180 },
  { icao: "A321", model: "Airbus A321",           category: 5, cruiseKt: 447, rangeNm: 4000, pax: 220 },
  { icao: "B737", model: "Boeing 737-700",        category: 5, cruiseKt: 453, rangeNm: 3010, pax: 149 },
  { icao: "B738", model: "Boeing 737-800",        category: 5, cruiseKt: 453, rangeNm: 2935, pax: 189 },
  { icao: "B38M", model: "Boeing 737 MAX 8",      category: 5, cruiseKt: 453, rangeNm: 3550, pax: 189 },
  { icao: "E190", model: "Embraer E190",          category: 5, cruiseKt: 447, rangeNm: 2400, pax: 114 },
  { icao: "E290", model: "Embraer E190-E2",       category: 5, cruiseKt: 447, rangeNm: 2850, pax: 114 },

  // Widebody
  { icao: "A332", model: "Airbus A330-200",       category: 6, cruiseKt: 470, rangeNm: 7250, pax: 246 },
  { icao: "A333", model: "Airbus A330-300",       category: 6, cruiseKt: 470, rangeNm: 6350, pax: 277 },
  { icao: "A339", model: "Airbus A330-900neo",    category: 6, cruiseKt: 470, rangeNm: 7200, pax: 287 },
  { icao: "A359", model: "Airbus A350-900",       category: 6, cruiseKt: 488, rangeNm: 8100, pax: 325 },
  { icao: "A35K", model: "Airbus A350-1000",      category: 6, cruiseKt: 488, rangeNm: 8700, pax: 366 },
  { icao: "A388", model: "Airbus A380",           category: 6, cruiseKt: 488, rangeNm: 8000, pax: 555 },
  { icao: "B772", model: "Boeing 777-200",        category: 6, cruiseKt: 482, rangeNm: 5240, pax: 314 },
  { icao: "B77W", model: "Boeing 777-300ER",      category: 6, cruiseKt: 482, rangeNm: 7370, pax: 396 },
  { icao: "B788", model: "Boeing 787-8",          category: 6, cruiseKt: 487, rangeNm: 7355, pax: 242 },
  { icao: "B789", model: "Boeing 787-9",          category: 6, cruiseKt: 487, rangeNm: 7635, pax: 290 },
  { icao: "B78X", model: "Boeing 787-10",         category: 6, cruiseKt: 487, rangeNm: 6430, pax: 330 },
  { icao: "B748", model: "Boeing 747-8",          category: 6, cruiseKt: 493, rangeNm: 7730, pax: 410 },

  // Personal/light jets
  { icao: "SF50", model: "Cirrus Vision SF50",    category: 3, cruiseKt: 311, rangeNm: 1200, pax: 6 },
  { icao: "E50P", model: "Embraer Phenom 100",    category: 3, cruiseKt: 390, rangeNm: 1178, pax: 7 },
  { icao: "E55P", model: "Embraer Phenom 300",    category: 3, cruiseKt: 453, rangeNm: 2010, pax: 9 },
  { icao: "HDJT", model: "HondaJet HA-420",       category: 3, cruiseKt: 422, rangeNm: 1223, pax: 7 },

  // Helicopters / rotorcraft
  { icao: "R44",  model: "Robinson R44",          category: 1, cruiseKt: 110, rangeNm: 300,  pax: 3 },
  { icao: "R66",  model: "Robinson R66",          category: 1, cruiseKt: 115, rangeNm: 350,  pax: 4 },
  { icao: "B06",  model: "Bell 206 JetRanger",    category: 1, cruiseKt: 117, rangeNm: 374,  pax: 4 },
  { icao: "H125", model: "Airbus H125",           category: 2, cruiseKt: 140, rangeNm: 340,  pax: 5 },
  { icao: "EC35", model: "Airbus H135",           category: 2, cruiseKt: 137, rangeNm: 343,  pax: 6 },
  { icao: "EC45", model: "Airbus H145",           category: 2, cruiseKt: 137, rangeNm: 351,  pax: 9 },
];

const BY_ICAO = new Map(SPECS.map((s) => [s.icao.toUpperCase(), s]));

// Mach 0.75 at typical cruise altitude ≈ 430 kt TAS. Used whenever an
// aircraft type is not present in the specs table so ETA still renders.
const DEFAULT_SPEC: AircraftSpec = {
  icao: "UNKN",
  model: "Unknown",
  category: 0,
  cruiseKt: 430, // Mach 0.75 default
  rangeNm: 1500,
  pax: 50,
};

export function lookupAircraftSpec(aircraftICAO?: string | null): { spec: AircraftSpec; matched: boolean } {
  const k = (aircraftICAO ?? "").toUpperCase().trim();
  if (!k) return { spec: DEFAULT_SPEC, matched: false };
  const hit = BY_ICAO.get(k);
  return hit ? { spec: hit, matched: true } : { spec: DEFAULT_SPEC, matched: false };
}

// ---------- ETA engine (modular: swap implementation later) ----------

const EARTH_RADIUS_NM = 3440.065; // nautical miles

export function haversineNm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface EtaInputs {
  departureMs: number;
  origin: { lat: number; lon: number } | null | undefined;
  destination: { lat: number; lon: number } | null | undefined;
  aircraftICAO?: string | null;
  /** Optional flight identifier for debug logging. */
  flightId?: string;
  /** Optional debug switch. Logs aircraft, cruise speed, distance, ETA. */
  debug?: boolean;
}

export interface EtaResult {
  distanceNm: number;
  cruiseKt: number;
  durationMs: number;
  etaMs: number;
  model: string;
  matched: boolean;
}

/** Fixed operational allowance (ms) added to cruise time to approximate
 *  taxi, takeoff, climb, descent, approach and landing. Phase 1: flat 20m. */
export const OPERATIONAL_ALLOWANCE_MS = 20 * 60 * 1000;

/** Distance/cruise-speed ETA + fixed operational allowance. Returns null when geo is missing. */
export function computeEta(inputs: EtaInputs): EtaResult | null {
  if (!inputs.origin || !inputs.destination) return null;
  if (!Number.isFinite(inputs.departureMs)) return null;
  const distanceNm = haversineNm(inputs.origin, inputs.destination);
  const { spec, matched } = lookupAircraftSpec(inputs.aircraftICAO);
  const cruiseKt = spec.cruiseKt;
  const cruiseMs = (distanceNm / cruiseKt) * 3600 * 1000;
  const durationMs = cruiseMs + OPERATIONAL_ALLOWANCE_MS;
  const etaMs = inputs.departureMs + durationMs;
  if (inputs.debug) {
    const hh = Math.floor(durationMs / 3600000);
    const mm = Math.floor((durationMs % 3600000) / 60000);
    // eslint-disable-next-line no-console
    console.log(
      `[ETA] flight=${inputs.flightId ?? "?"} icao=${inputs.aircraftICAO ?? "?"} ` +
        `model="${spec.model}"${matched ? "" : " (FALLBACK)"} ` +
        `cruise=${cruiseKt}kt distance=${distanceNm.toFixed(1)}NM ` +
        `cruiseTime=${Math.round(cruiseMs / 60000)}m +allowance=${OPERATIONAL_ALLOWANCE_MS / 60000}m ` +
        `total=${hh}h ${mm}m eta=${formatEtaUtc(etaMs)}`,
    );
  }
  return { distanceNm, cruiseKt, durationMs, etaMs, model: spec.model, matched };
}


/** UUIDv7 → unix ms (SimFly mission ids are v7). */
export function uuidV7Ms(id?: string | null): number | null {
  const prefix = id?.replace(/-/g, "").slice(0, 12);
  if (!prefix || prefix.length !== 12) return null;
  const ms = Number.parseInt(prefix, 16);
  return Number.isFinite(ms) ? ms : null;
}

/** Format ETA timestamp as HH:MM UTC. */
export function formatEtaUtc(etaMs: number): string {
  const d = new Date(etaMs);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm} UTC`;
}

/** Format remaining time relative to now. */
export function formatRemainingFromNow(etaMs: number, now: number = Date.now()): string {
  const diffMin = Math.round((etaMs - now) / 60000);
  if (diffMin <= 0) return "Arriving";
  if (diffMin < 60) return `${diffMin} min remaining`;
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  return `${h}h ${m}m remaining`;
}

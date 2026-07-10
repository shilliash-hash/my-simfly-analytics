import { createServerFn } from "@tanstack/react-start";
import { lookupAircraftSpec } from "@/lib/aircraft-specs";

/**
 * Pilot Career analytics — isolated read-only aggregations over the
 * already-imported `simfly_flights` rows for a single pilot.
 *
 * Zero writes. Zero new tables. No changes to existing logic.
 */

const DEFAULT_USERNAME = "shill";

function sanitiseUsername(raw?: string | null): string {
  const v = (raw ?? "").trim();
  return /^[A-Za-z0-9_.-]{1,40}$/.test(v) ? v : "";
}

export type PilotCareerAirportVisit = {
  icao: string;
  visits: number;
};

export type PilotCareerLongestFlight = {
  flightId: string;
  departureIcao: string | null;
  destinationIcao: string | null;
  distanceNm: number;
  aircraft: string | null;
  aircraftIcao: string | null;
  ts: string | null;
};

export type PilotCareerTierSlice = {
  tier: number;      // 1..6, or 0 for unknown
  label: string;     // "Tier 1", "Unknown"
  flights: number;
};

export type PilotCareerCountry = {
  code: string; // 2-letter ICAO prefix
  name: string; // pretty country/region name
  visits: number;
  flag: string; // dodatkowe flagi
};

export type PilotCareerPayload = {
  username: string;
  totalFlights: number;
  totalDistanceNm: number;
  earthCircumferencesNm: number; // constant used
  circumferencesFlown: number;
  topAirports: PilotCareerAirportVisit[];
  longestFlight: PilotCareerLongestFlight | null;
  tierDistribution: PilotCareerTierSlice[];
  countries: PilotCareerCountry[];
};

// ICAO first-two-letter → country/region.
// Not exhaustive; falls back to raw prefix code when unknown.
const ICAO_PREFIX: Record<string, string> = {
  EN: "Norway", ES: "Sweden", EF: "Finland", EK: "Denmark", EI: "Ireland",
  EG: "United Kingdom", EH: "Netherlands", EB: "Belgium", EL: "Luxembourg",
  ED: "Germany", ET: "Germany", LF: "France", LS: "Switzerland", LO: "Austria",
  LI: "Italy", LE: "Spain", LP: "Portugal", LG: "Greece", LT: "Turkey",
  LM: "Malta", LK: "Czechia", LZ: "Slovakia", LH: "Hungary", LR: "Romania",
  LB: "Bulgaria", LC: "Cyprus", LD: "Croatia", LJ: "Slovenia", LY: "Serbia",
  LQ: "Bosnia", LW: "N. Macedonia", LA: "Albania", LU: "Moldova",
  EP: "Poland", EE: "Estonia", EV: "Latvia", EY: "Lithuania", UM: "Belarus",
  UK: "Ukraine", UU: "Russia", UL: "Russia", UE: "Russia", UN: "Russia", US: "Russia",
  BI: "Iceland", BG: "Greenland",
  KA: "USA", KB: "USA", KC: "USA", KD: "USA", KE: "USA", KF: "USA", KG: "USA",
  KH: "USA", KI: "USA", KJ: "USA", KK: "USA", KL: "USA", KM: "USA", KN: "USA",
  KO: "USA", KP: "USA", KR: "USA", KS: "USA", KT: "USA", KU: "USA", KV: "USA",
  KW: "USA", KX: "USA", KY: "USA", KZ: "USA",
  PA: "Alaska (USA)", PH: "Hawaii (USA)", PG: "Guam", PJ: "N. Marianas", PK: "Marshall Is.",
  CY: "Canada", CZ: "Canada",
  MM: "Mexico", MU: "Cuba", MD: "Dominican Republic", MT: "Haiti",
  MK: "Jamaica", MY: "Bahamas", MZ: "Belize", MP: "Panama", MR: "Costa Rica",
  MS: "El Salvador", MG: "Guatemala", MH: "Honduras", MN: "Nicaragua",
  TA: "Antigua", TB: "Barbados", TF: "France (Caribbean)", TG: "Grenada",
  TI: "US Virgin Is.", TJ: "Puerto Rico", TK: "St. Kitts", TL: "St. Lucia",
  TN: "Caribbean Neth.", TQ: "Anguilla", TR: "Montserrat", TT: "Trinidad",
  TU: "British V.I.", TV: "St. Vincent", TX: "Cayman Is.",
  SA: "Argentina", SB: "Brazil", SC: "Chile", SD: "Brazil", SE: "Ecuador",
  SG: "Paraguay", SK: "Colombia", SL: "Bolivia", SM: "Suriname", SO: "French Guiana",
  SP: "Peru", SU: "Uruguay", SV: "Venezuela", SY: "Guyana",
  DA: "Algeria", DB: "Benin", DF: "Burkina Faso", DG: "Ghana", DI: "Ivory Coast",
  DN: "Nigeria", DR: "Niger", DT: "Tunisia", DX: "Togo",
  FA: "South Africa", FB: "Botswana", FC: "Congo", FD: "Eswatini", FE: "C.A.R.",
  FG: "Eq. Guinea", FH: "St. Helena", FI: "Mauritius", FJ: "British I.O.T.",
  FK: "Cameroon", FL: "Zambia", FM: "Madagascar", FN: "Angola", FO: "Gabon",
  FP: "São Tomé", FQ: "Mozambique", FS: "Seychelles", FT: "Chad", FV: "Zimbabwe",
  FW: "Malawi", FX: "Lesotho", FY: "Namibia", FZ: "DR Congo",
  GA: "Mali", GB: "Gambia", GC: "Canary Is.", GE: "Ceuta/Melilla", GF: "Sierra Leone",
  GG: "Guinea-Bissau", GL: "Liberia", GM: "Morocco", GO: "Senegal",
  GQ: "Mauritania", GS: "W. Sahara", GU: "Guinea", GV: "Cape Verde",
  HA: "Ethiopia", HB: "Burundi", HC: "Somalia", HD: "Djibouti", HE: "Egypt",
  HH: "Eritrea", HK: "Kenya", HL: "Libya", HR: "Rwanda", HS: "Sudan",
  HT: "Tanzania", HU: "Uganda",
  OA: "Afghanistan", OB: "Bahrain", OE: "Saudi Arabia", OI: "Iran", OJ: "Jordan",
  OK: "Kuwait", OL: "Lebanon", OM: "UAE", OO: "Oman", OP: "Pakistan",
  OR: "Iraq", OS: "Syria", OT: "Qatar", OY: "Yemen",
  VA: "India", VC: "Sri Lanka", VD: "Cambodia", VE: "India", VG: "Bangladesh",
  VH: "Hong Kong", VI: "India", VL: "Laos", VM: "Macau", VN: "Nepal",
  VO: "India", VQ: "Bhutan", VR: "Maldives", VT: "Thailand", VV: "Vietnam",
  VY: "Myanmar",
  RC: "Taiwan", RJ: "Japan", RK: "S. Korea", RO: "Japan", RP: "Philippines",
  Z: "China", ZB: "China", ZG: "China", ZH: "China", ZJ: "China", ZL: "China",
  ZM: "Mongolia", ZP: "China", ZS: "China", ZU: "China", ZW: "China", ZY: "China",
  ZK: "N. Korea",
  UA: "Kazakhstan", UB: "Azerbaijan", UC: "Kyrgyzstan", UD: "Armenia",
  UG: "Georgia", UT: "Uzbekistan/Tajikistan/Turkmenistan",
  WA: "Indonesia", WB: "Malaysia/Brunei", WI: "Indonesia", WM: "Malaysia",
  WP: "Timor-Leste", WQ: "Indonesia", WR: "Indonesia", WS: "Singapore",
  YB: "Australia", YM: "Australia", YS: "Australia",
  NZ: "New Zealand", NF: "Fiji", NG: "Kiribati/Tuvalu", NI: "Niue",
  NL: "Wallis & Futuna", NS: "Samoa", NT: "French Polynesia", NV: "Vanuatu",
  NW: "New Caledonia",
  AG: "Solomon Is.", AN: "Nauru", AY: "Papua New Guinea",
  SC_: "Chile",
};

// Słownik flag dopasowany do Twoich prefiksów ICAO
const ICAO_FLAGS: Record<string, string> = {
  EN: "🇳🇴", ES: "🇸🇪", EF: "🇫🇮", EK: "🇩🇰", EI: "🇮🇪", EG: "🇬🇧", EH: "🇳🇱", EB: "🇧🇪", EL: "🇱🇺",
  ED: "🇩🇪", ET: "🇩🇪", LF: "🇫🇷", LS: "🇨🇭", LO: "🇦🇹", LI: "🇮🇹", LE: "🇪🇸", LP: "🇵🇹", LG: "🇬🇷",
  LT: "🇹🇷", LM: "🇲🇹", LK: "🇨🇿", LZ: "🇸🇰", LH: "🇭🇺", LR: "🇷🇴", LB: "🇧🇬", LC: "🇨🇾", LD: "🇭🇷",
  LJ: "🇸🇮", LY: "🇷🇸", LQ: "🇧🇦", LW: "🇲🇰", LA: "🇦🇱", LU: "🇲🇩", EP: "🇵🇱", EE: "🇪🇪", EV: "🇱🇻",
  EY: "🇱🇹", UM: "🇧🇾", UK: "🇺🇦", UU: "🇷🇺", UL: "🇷🇺", UE: "🇷🇺", UN: "🇷🇺", US: "🇷🇺", BI: "🇮🇸",
  BG: "🇬🇱", KA: "🇺🇸", KB: "🇺🇸", KC: "🇺🇸", KD: "🇺🇸", KE: "🇺🇸", KF: "🇺🇸", KG: "🇺🇸", KH: "🇺🇸",
  KI: "🇺🇸", KJ: "🇺🇸", KK: "🇺🇸", KL: "🇺🇸", KM: "🇺🇸", KN: "🇺🇸", KO: "🇺🇸", KP: "🇺🇸", KR: "🇺🇸",
  KS: "🇺🇸", KT: "🇺🇸", KU: "🇺🇸", KV: "🇺🇸", KW: "🇺🇸", KX: "🇺🇸", KY: "🇺🇸", KZ: "🇺🇸", PA: "🇺🇸",
  PH: "🇺🇸", PG: "🇬🇺", PJ: "🇲🇵", PK: "🇲🇭", CY: "🇨🇦", CZ: "🇨🇦", MM: "🇲🇽", MU: "🇨🇺", MD: "🇩🇴",
  MT: "🇭🇹", MK: "🇯🇲", MY: "🇧🇸", MZ: "🇧🇿", MP: "🇵🇦", MR: "🇨🇷", MS: "🇸🇻", MG: "🇬🇹", MH: "🇭🇳",
  MN: "🇳🇮", TA: "🇦🇬", TB: "🇧🇧", TF: "🇬🇵", TG: "🇬🇩", TI: "🇻🇮", TJ: "🇵🇷", TK: "🇰🇳", TL: "🇱🇨",
  TN: "🇧🇶", TQ: "🇦🇮", TR: "🇲🇸", TT: "🇹🇹", TU: "🇻🇬", TV: "🇻🇨", TX: "🇰🇾", SA: "🇦🇷", SB: "🇧🇷",
  SC: "🇨🇱", SD: "🇧🇷", SE: "🇪🇨", SG: "🇵🇾", SK: "🇨🇴", SL: "🇧🇴", SM: "🇸🇷", SO: "🇬🇫", SP: "🇵🇪",
  SU: "🇺🇾", SV: "🇻🇪", SY: "🇬🇾", DA: "🇩🇿", DB: "🇧🇯", DF: "🇧🇫", DG: "🇬🇭", DI: "🇨🇮", DN: "🇳🇬",
  DR: "🇳🇪", DT: "🇹🇳", DX: "🇹🇬", FA: "🇿🇦", FB: "🇧🇼", FC: "🇨🇬", FD: "🇸🇿", FE: "🇨🇫", FG: "🇬🇶",
  FH: "🇸🇭", FI: "🇲🇺", FJ: "🇮🇴", FK: "🇨🇲", FL: "🇿🇲", FM: "🇲🇬", FN: "🇦🇴", FO: "🇬🇦", FP: "🇸🇹",
  FQ: "🇲🇿", FS: "🇸🇨", FT: "🇹🇩", FV: "🇿🇼", FW: "🇲🇼", FX: "🇱🇸", FY: "🇳🇦", FZ: "🇨🇩", GA: "🇲🇱",
  GB: "🇬🇲", GC: "🇮🇨", GE: "🇪🇦", GF: "🇸🇱", GG: "🇬🇼", GL: "🇱🇷", GM: "🇲🇦", GO: "🇸🇳", GQ: "🇲🇷",
  GS: "🇪🇭", GU: "🇬🇳", GV: "🇨🇻", HA: "🇪🇹", HB: "🇧🇮", HC: "🇸🇴", HD: "🇩🇯", HE: "🇪🇬", HH: "🇪🇷",
  HK: "🇰🇪", HL: "🇱🇾", HR: "🇷🇼", HS: "🇸🇩", HT: "🇹🇿", HU: "🇺🇬", OA: "🇦🇫", OB: "🇧🇭", OE: "🇸🇦",
  OI: "🇮🇷", OJ: "🇯🇴", OK: "🇰🇼", OL: "🇱🇧", OM: "🇦🇪", OO: "🇴🇲", OP: "🇵🇰", OR: "🇮🇶", OS: "🇸🇾",
  OT: "🇶🇦", OY: "🇾🇪", VA: "🇮🇳", VC: "🇱🇰", VD: "🇰🇭", VE: "🇮🇳", VG: "🇧🇩", VH: "🇭🇰", VI: "🇮🇳",
  VL: "🇱🇦", VM: "🇲🇴", VN: "🇳🇵", VO: "🇮🇳", VQ: "🇧🇹", VR: "🇲🇻", VT: "🇹🇭", VV: "🇻🇳", VY: "🇲🇲",
  RC: "🇹🇼", RJ: "🇯🇵", RK: "🇰🇷", RO: "🇯🇵", RP: "🇵🇭", Z: "🇨🇳", ZB: "🇨🇳", ZG: "🇨🇳", ZH: "🇨🇳",
  ZJ: "🇨🇳", ZL: "🇨🇳", ZM: "🇲🇳", ZP: "🇨🇳", ZS: "🇨🇳", ZU: "🇨🇳", ZW: "🇨🇳", ZY: "🇨🇳", ZK: "🇰🇵",
  UA: "🇰🇿", UB: "🇦🇿", UC: "🇰🇬", UD: "🇦🇲", UG: "🇬🇪", UT: "🇺🇿", WA: "🇮🇩", WB: "🇲🇾", WI: "🇮🇩",
  WM: "🇲🇾", WP: "🇹🇱", WQ: "🇮🇩", WR: "🇮🇩", WS: "🇸🇬", YB: "🇦🇺", YM: "🇦🇺", YS: "🇦🇺", NZ: "🇳🇿",
  NF: "🇫🇯", NG: "🇹🇻", NI: "🇳🇺", NL: "🇼🇫", NS: "🇼🇸", NT: "🇵🇫", NV: "🇻🇺", NW: "🇳🇨", AG: "🇸🇧",
  AN: "🇳🇷", AY: "🇵🇬", SC_: "🇨🇱",
};


// Flagi na frontend dodatkowo
function countryFromIcao(icao: string): { code: string; name: string; flag: string } | null {
  const s = (icao ?? "").toUpperCase().trim();
  if (s.length < 2) return null;
  const two = s.slice(0, 2);
  const one = s.slice(0, 1);
  const name = ICAO_PREFIX[two] ?? ICAO_PREFIX[one] ?? two;
  
  // Szukamy odpowiedniej emotki – jeśli jej nie ma, zostawiamy pusty string lub domyślny globus 🌐
  const flag = ICAO_FLAGS[two] ?? ICAO_FLAGS[one] ?? "🌐"; 
  
  return { code: two, name, flag };
}


export const getPilotCareer = createServerFn({ method: "GET" })
  .inputValidator((d?: { username?: string }) => d ?? {})
  .handler(async ({ data }): Promise<PilotCareerPayload> => {
    
      // BEZPIECZNIK LOGICZNY: Zapobiegamy pustym zapytaniom GET z nawigacji frontendu
    let rawUsername = data?.username || (data as any)?.data?.username || (data as any)?.keyTag || "";
    
    if (!rawUsername || rawUsername === "undefined" || rawUsername === "null" || String(rawUsername).trim().length === 0) {
      rawUsername = process.env.SIMFLY_USERNAME || "shill";
    }

    const uname = String(rawUsername).replace("@", "").trim().toLowerCase();



    const empty: PilotCareerPayload = {
      username: uname,
      totalFlights: 0,
      totalDistanceNm: 0,
      earthCircumferencesNm: 21600,
      circumferencesFlown: 0,
      topAirports: [],
      longestFlight: null,
      tierDistribution: [],
      countries: [],
    };
    if (!uname) return empty;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Pull minimal columns for the pilot. Paginate to avoid PostgREST caps.
    type Row = {
      flight_id: string;
      mission_start_ts: string | null;
      aircraft: string | null;
      aircraft_icao: string | null;
      departure_icao: string | null;
      destination_icao: string | null;
      total_distance: number | null;
      flight_time: string | null;
    };
   
    if (all.length === 0) return empty;

    // Aggregate
    const visitsByIcao = new Map<string, number>();
    const countryVisits = new Map<string, { name: string; visits: number }>();
    const tierCounts = new Map<number, number>();
    let totalDistance = 0;
    let longest: PilotCareerLongestFlight | null = null;

for (const r of all) {
  const dist = Number(r.total_distance ?? 0);
  if (Number.isFinite(dist) && dist > 0) totalDistance += dist;

  // 1. Precyzyjnie zamieniamy format "HH:MM:SS" na liczbowe godziny
  let flightHours = 0;
  const timeStr = String(r.flight_time ?? "").trim();
  if (timeStr.includes(":")) {
    const parts = timeStr.split(":").map(Number);
    if (parts.length === 3) {
      // Format HH:MM:SS (standard z Supabase)
      const [h, m, s] = parts;
      flightHours = (h || 0) + (m || 0) / 60 + (s || 0) / 3600;
    } else if (parts.length === 2) {
      // Zabezpieczenie na wypadek formatu HH:MM
      const [h, m] = parts;
      flightHours = (h || 0) + (m || 0) / 60;
    }
  }

  // 2. Wyliczamy Ground Speed (węzły)
  const groundSpeed = flightHours > 0 ? (dist / flightHours) : 0;

  // 3. Filtr anomalii: odrzucamy loty, gdzie wyliczona prędkość przekracza 750 węzłów (Mach 1+),
  // co jednoznacznie wskazuje na uszkodzony zapis odległości przy krótkim czasie lotu.
  const isAnomalous = dist > 500 && (groundSpeed > 750 || flightHours === 0);

  for (const icao of [r.departure_icao, r.destination_icao]) {
    if (!icao) continue;
    const up = icao.toUpperCase();
    visitsByIcao.set(up, (visitsByIcao.get(up) ?? 0) + 1);
    const c = countryFromIcao(up);
    if (c) {
      const cur = countryVisits.get(c.code) ?? { name: c.name, visits: 0 };
      cur.visits += 1;
      countryVisits.set(c.code, cur);
    }
  }

  // Tier via aircraft-specs lookup
  const spec = lookupAircraftSpec(r.aircraft_icao ?? undefined);
  const tier = spec.matched ? spec.spec.category : 0;
  tierCounts.set(tier, (tierCounts.get(tier) ?? 0) + 1);

  // 4. Przypisujemy rekord życiowy tylko dla zweryfikowanych lotów
  if (dist > 0 && !isAnomalous && (!longest || dist > longest.distanceNm)) {
    longest = {
      flightId: r.flight_id,
      departureIcao: r.departure_icao,
      destinationIcao: r.destination_icao,
      distanceNm: Math.round(dist),
      aircraft: r.aircraft,
      aircraftIcao: r.aircraft_icao,
      ts: r.mission_start_ts,
    };
  }
}


    const topAirports: PilotCareerAirportVisit[] = [...visitsByIcao.entries()]
      .map(([icao, visits]) => ({ icao, visits }))
      .sort((a, b) => b.visits - a.visits)
      .slice(0, 10);

    const tierDistribution: PilotCareerTierSlice[] = [...tierCounts.entries()]
      .map(([tier, flights]) => ({
        tier,
        label: tier === 0 ? "Unknown" : `Tier ${tier}`,
        flights,
      }))
      .sort((a, b) => (a.tier === 0 ? 1 : b.tier === 0 ? -1 : a.tier - b.tier));

    const countries: PilotCareerCountry[] = [...countryVisits.entries()]
      .map(([code, v]) => ({ code, name: v.name, visits: v.visits }))
      .sort((a, b) => b.visits - a.visits);

    const EARTH = 21600;
    return {
      username: uname,
      totalFlights: all.length,
      totalDistanceNm: Math.round(totalDistance),
      earthCircumferencesNm: EARTH,
      circumferencesFlown: Math.round((totalDistance / EARTH) * 100) / 100,
      topAirports,
      longestFlight: longest,
      tierDistribution,
      countries,
    };
  });

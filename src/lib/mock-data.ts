import type {
  Aircraft,
  ActivityEntry,
  EarningsPoint,
  Hub,
  Player,
  SimflyPayload,
  Tier,
  XpByAsset,
} from "./types";

// Deterministic mock data for the SimFly Airport Intelligence Hub.
// TODO: Replace with live SimFly API responses (see src/lib/simfly.functions.ts).

const COUNTRIES = ["US", "DE", "JP", "BR", "AU", "GB", "FR", "ZA", "AE", "IN"];

const tierFor = (level: number): Tier =>
  level >= 40 ? "platinum" : level >= 25 ? "gold" : level >= 12 ? "silver" : "bronze";

export const ME: Player = {
  handle: "skycaptain",
  displayName: "Sky Captain",
  level: 32,
  xp: 184_500,
  paxTokens: 1_284_320,
  avatarHue: 190,
  joinedAt: "2024-03-12T00:00:00Z",
  country: "US",
};

export const COMMUNITY: Player[] = [
  ME,
  { handle: "nordwind", displayName: "Nordwind", level: 47, xp: 412_900, paxTokens: 3_180_000, avatarHue: 220, joinedAt: "2023-08-01T00:00:00Z", country: "DE" },
  { handle: "tokyo_jet", displayName: "Tokyo Jet", level: 41, xp: 298_400, paxTokens: 2_410_500, avatarHue: 350, joinedAt: "2023-11-04T00:00:00Z", country: "JP" },
  { handle: "rio_runway", displayName: "Rio Runway", level: 28, xp: 152_300, paxTokens: 980_220, avatarHue: 50, joinedAt: "2024-01-20T00:00:00Z", country: "BR" },
  { handle: "outback_air", displayName: "Outback Air", level: 35, xp: 221_700, paxTokens: 1_640_800, avatarHue: 30, joinedAt: "2023-10-15T00:00:00Z", country: "AU" },
  { handle: "heathrow_hq", displayName: "Heathrow HQ", level: 38, xp: 268_200, paxTokens: 1_990_400, avatarHue: 270, joinedAt: "2023-09-09T00:00:00Z", country: "GB" },
  { handle: "alpine_ops", displayName: "Alpine Ops", level: 22, xp: 98_400, paxTokens: 612_000, avatarHue: 150, joinedAt: "2024-05-02T00:00:00Z", country: "FR" },
  { handle: "savanna_wing", displayName: "Savanna Wing", level: 19, xp: 71_200, paxTokens: 488_900, avatarHue: 90, joinedAt: "2024-06-18T00:00:00Z", country: "ZA" },
  { handle: "gulf_pilot", displayName: "Gulf Pilot", level: 44, xp: 351_600, paxTokens: 2_780_000, avatarHue: 200, joinedAt: "2023-07-22T00:00:00Z", country: "AE" },
  { handle: "monsoon_air", displayName: "Monsoon Air", level: 16, xp: 54_200, paxTokens: 340_100, avatarHue: 120, joinedAt: "2024-07-11T00:00:00Z", country: "IN" },
];

const HUB_SEEDS: Array<Omit<Hub, "tier" | "ownerHandle"> & { ownerHandle?: string }> = [
  { id: "h1", icao: "KJFK", name: "John F. Kennedy Intl",  city: "New York",   country: "US", level: 38, xp: 268_400, dailyPax: 41_200, dailyEarnings: 18_400, passengerFlow: 1_236_000, upgrades: 14, lastUpgradeAt: "2026-06-10T11:20:00Z", lat: 40.64,  lon: -73.78, ownerHandle: "skycaptain" },
  { id: "h2", icao: "EDDF", name: "Frankfurt Main",         city: "Frankfurt",  country: "DE", level: 47, xp: 412_900, dailyPax: 58_900, dailyEarnings: 26_200, passengerFlow: 1_767_000, upgrades: 19, lastUpgradeAt: "2026-06-12T08:05:00Z", lat: 50.03,  lon: 8.56,   ownerHandle: "nordwind" },
  { id: "h3", icao: "RJTT", name: "Tokyo Haneda",           city: "Tokyo",      country: "JP", level: 41, xp: 298_400, dailyPax: 49_300, dailyEarnings: 21_800, passengerFlow: 1_479_000, upgrades: 16, lastUpgradeAt: "2026-06-11T22:40:00Z", lat: 35.55,  lon: 139.78, ownerHandle: "tokyo_jet" },
  { id: "h4", icao: "SBGR", name: "São Paulo Guarulhos",    city: "São Paulo",  country: "BR", level: 28, xp: 152_300, dailyPax: 28_400, dailyEarnings: 12_100, passengerFlow:   852_000, upgrades:  9, lastUpgradeAt: "2026-06-09T14:15:00Z", lat: -23.43, lon: -46.47, ownerHandle: "rio_runway" },
  { id: "h5", icao: "YSSY", name: "Sydney Kingsford Smith", city: "Sydney",     country: "AU", level: 35, xp: 221_700, dailyPax: 36_500, dailyEarnings: 15_900, passengerFlow: 1_095_000, upgrades: 12, lastUpgradeAt: "2026-06-08T03:50:00Z", lat: -33.94, lon: 151.18, ownerHandle: "outback_air" },
  { id: "h6", icao: "EGLL", name: "London Heathrow",        city: "London",     country: "GB", level: 38, xp: 268_200, dailyPax: 44_100, dailyEarnings: 19_700, passengerFlow: 1_323_000, upgrades: 13, lastUpgradeAt: "2026-06-13T09:30:00Z", lat: 51.47,  lon: -0.45,  ownerHandle: "heathrow_hq" },
  { id: "h7", icao: "LFPG", name: "Paris Charles de Gaulle",city: "Paris",      country: "FR", level: 22, xp:  98_400, dailyPax: 19_800, dailyEarnings:  8_400, passengerFlow:   594_000, upgrades:  7, lastUpgradeAt: "2026-06-07T17:00:00Z", lat: 49.01,  lon: 2.55,   ownerHandle: "alpine_ops" },
  { id: "h8", icao: "FAOR", name: "Johannesburg OR Tambo",  city: "Johannesburg", country: "ZA", level: 19, xp:  71_200, dailyPax: 16_200, dailyEarnings:  6_900, passengerFlow:   486_000, upgrades:  6, lastUpgradeAt: "2026-06-06T12:25:00Z", lat: -26.13, lon: 28.24,  ownerHandle: "savanna_wing" },
  { id: "h9", icao: "OMDB", name: "Dubai International",    city: "Dubai",      country: "AE", level: 44, xp: 351_600, dailyPax: 53_800, dailyEarnings: 24_100, passengerFlow: 1_614_000, upgrades: 17, lastUpgradeAt: "2026-06-13T20:10:00Z", lat: 25.25,  lon: 55.36,  ownerHandle: "gulf_pilot" },
  { id: "h10", icao: "VIDP", name: "Indira Gandhi Intl",    city: "Delhi",      country: "IN", level: 16, xp:  54_200, dailyPax: 13_400, dailyEarnings:  5_400, passengerFlow:   402_000, upgrades:  5, lastUpgradeAt: "2026-06-05T07:45:00Z", lat: 28.56,  lon: 77.10,  ownerHandle: "monsoon_air" },
  { id: "h11", icao: "KLAX", name: "Los Angeles Intl",      city: "Los Angeles",country: "US", level: 31, xp: 178_900, dailyPax: 32_700, dailyEarnings: 14_200, passengerFlow:   981_000, upgrades: 11, lastUpgradeAt: "2026-06-12T19:55:00Z", lat: 33.94,  lon: -118.40, ownerHandle: "skycaptain" },
  { id: "h12", icao: "ZBAA", name: "Beijing Capital",       city: "Beijing",    country: "CN", level: 26, xp: 134_600, dailyPax: 24_800, dailyEarnings: 10_900, passengerFlow:   744_000, upgrades:  8, lastUpgradeAt: "2026-06-11T05:30:00Z", lat: 40.08,  lon: 116.58, ownerHandle: "skycaptain" },
];

export const HUBS: Hub[] = HUB_SEEDS.map((h) => ({
  ...h,
  ownerHandle: h.ownerHandle ?? "skycaptain",
  tier: tierFor(h.level),
}));

const AC_TYPES = [
  "Boeing 737-800", "Boeing 777-300ER", "Boeing 787-9",
  "Airbus A320neo", "Airbus A350-900", "Airbus A220-300",
  "Embraer E195-E2", "Bombardier CRJ-900", "ATR 72-600",
];

export const AIRCRAFT: Aircraft[] = Array.from({ length: 25 }).map((_, i) => {
  const hub = HUBS[i % HUBS.length];
  const status: Aircraft["status"] =
    i % 11 === 0 ? "maintenance" : i % 13 === 0 ? "grounded" : i % 5 === 0 ? "transit" : "active";
  return {
    id: `a${i + 1}`,
    registration: `N${100 + i}SF`,
    type: AC_TYPES[i % AC_TYPES.length],
    status,
    locationIcao: hub.icao,
    ownerHandle: hub.ownerHandle,
    xpGenerated: 4_000 + ((i * 911) % 18_000),
    flightsToday: status === "active" ? 2 + (i % 4) : 0,
    paxToday: status === "active" ? 220 + ((i * 73) % 480) : 0,
  };
});

const ACTIVITY_KINDS: ActivityEntry["kind"][] = ["upgrade", "purchase", "levelup", "route", "license"];
const ACTIVITY_TEMPLATES: Record<ActivityEntry["kind"], (h: Hub, p: Player) => string> = {
  upgrade:   (h) => `Upgraded ${h.icao} terminal to L${h.level}`,
  purchase:  (h) => `Acquired new gate cluster at ${h.icao}`,
  levelup:   (_, p) => `${p.displayName} reached level ${p.level}`,
  route:     (h)    => `Opened new route from ${h.icao}`,
  license:   (h, p) => `License used · ${h.icao} departure · +${Math.floor(Math.random()*400)+120} PAX`,
};

export const ACTIVITY: ActivityEntry[] = Array.from({ length: 50 }).map((_, i) => {
  const kind = ACTIVITY_KINDS[i % ACTIVITY_KINDS.length];
  const hub = HUBS[i % HUBS.length];
  const player = COMMUNITY[i % COMMUNITY.length];
  const hoursAgo = i * 3 + (i % 5);
  const at = new Date(Date.UTC(2026, 5, 14, 9, 0, 0) - hoursAgo * 3_600_000).toISOString();
  return {
    id: `e${i + 1}`,
    kind,
    actorHandle: player.handle,
    hubIcao: kind === "levelup" ? undefined : hub.icao,
    message: ACTIVITY_TEMPLATES[kind](hub, player),
    delta: kind === "levelup" ? 1 : 200 + ((i * 137) % 1200),
    at,
  };
});

export const EARNINGS: EarningsPoint[] = Array.from({ length: 30 }).map((_, i) => {
  const date = new Date(Date.UTC(2026, 4, 16) + i * 86_400_000).toISOString().slice(0, 10);
  const base = 38_000 + Math.round(Math.sin(i / 4) * 6_500) + i * 420;
  return {
    date,
    pax: base + ((i * 311) % 4_000),
    xp: Math.round(base * 0.42) + ((i * 97) % 1_800),
  };
});

export const XP_BY_ASSET: XpByAsset[] = [
  ...HUBS.slice(0, 4).map((h) => ({ label: h.icao, xp: h.xp, kind: "hub" as const })),
  { label: "N100SF · 737-800", xp: 22_400, kind: "aircraft" },
  { label: "N104SF · A350-900", xp: 19_800, kind: "aircraft" },
  { label: "JFK ↔ LHR",  xp: 17_200, kind: "route" },
  { label: "DXB ↔ HND",  xp: 14_900, kind: "route" },
];

export const MOCK_PAYLOAD: SimflyPayload = {
  me: ME,
  paxTokens: ME.paxTokens,
  level: ME.level,
  xp: ME.xp,
  availablePax: 0,
  lifetimePax: ME.paxTokens,
  paxLast7d: 0,
  paxLast30d: 0,
  aircraft: AIRCRAFT,
  hubs: HUBS,
  activity: ACTIVITY,
  earningsTimeseries: EARNINGS,
  xpByAsset: XP_BY_ASSET,
  paxByAsset: [],
  airports: [],
  airplanes: [],
  licenses: [],
  flights: [],
  visitors: [],
  community: COMMUNITY,
};

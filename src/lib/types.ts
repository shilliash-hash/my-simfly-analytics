// SimFly Airport Intelligence Hub — domain types.

export type Tier = "bronze" | "silver" | "gold" | "platinum";
export type AircraftStatus = "active" | "maintenance" | "grounded" | "transit";

/** Airport size tiers used by simfly.io: 4 = Large, 3 = Medium, 2 = Regional, etc. */
export type AirportTier = "T1" | "T2" | "T3" | "T4" | "T5" | "T6";

export interface Player {
  handle: string;
  displayName: string;
  level: number;
  xp: number;
  paxTokens: number;
  avatarHue: number;
  avatarUrl?: string;
  joinedAt: string;
  country: string;
}

export interface Hub {
  id: string;
  icao: string;
  name: string;
  city: string;
  country: string;
  ownerHandle: string;
  level: number;
  tier: Tier;
  xp: number;
  dailyPax: number;
  dailyEarnings: number;
  passengerFlow: number;
  upgrades: number;
  lastUpgradeAt: string;
  lat: number;
  lon: number;
}

export interface Aircraft {
  id: string;
  registration: string;
  type: string;
  status: AircraftStatus;
  locationIcao: string;
  ownerHandle: string;
  xpGenerated: number;
  flightsToday: number;
  paxToday: number;
}

export type ActivityKind = "upgrade" | "purchase" | "levelup" | "route" | "license";

export interface ActivityEntry {
  id: string;
  kind: ActivityKind;
  actorHandle: string;
  hubIcao?: string;
  aircraftReg?: string;
  message: string;
  delta?: number;
  at: string;
}

export interface EarningsPoint {
  date: string;
  pax: number;
  paxKept?: number;
  paxDonated?: number;
  /** PAX earned from other pilots' flights through my hubs (airport leg). */
  paxVisitors?: number;
  xp: number;
}


export interface XpByAsset {
  label: string;
  xp: number;
  kind: "hub" | "aircraft" | "route";
}

export interface PaxByAsset {
  label: string;
  pax: number;
  kind: "hub" | "aircraft" | "licence";
}

/** Extended airport row (joins assets/all + per-flight rollups). */
export interface AirportExt {
  icao: string;
  name: string;
  country: string;
  slug: string;
  category: number;
  tier: AirportTier;
  tierLabel: string;
  level: number;
  levelProgress: number; // 0..100
  totalEarnedPax: number;
  totalEarnedXp: number;
  rotation: number;
  maxRotation: number;
  totalRotations: number;
  percToUser: number;
  imageSrc?: string;
  pax7d: number;
  pax30d: number;
  flights7d: number;
}

export interface AircraftExt {
  aircraftId: string;
  name: string;
  icao: string;
  tailNumber: string;
  slug: string;
  level: number;
  levelProgress: number;
  totalEarnedPax: number;
  totalEarnedXp: number;
  currentIcao: string;
  category: number;
  imageSrc?: string;
  inGroundOperation: boolean;
  groundedUntil: string | null;
  pax7d: number;
  pax30d: number;
}

export interface LicenseTimer {
  kind: "TIMER24" | "TIMER84";
  minutesAvailable: number;
  minutesCap: number;
  nextRestoreTs: number; // unix seconds
  minsUntilNextRestore: number;
}

export interface LicenseExt {
  sku: string;
  slug: string;
  code: string;
  name: string;
  rank: number;
  rankName: string;
  level: number;
  levelProgress: number;
  totalEarnedPax: number;
  totalEarnedXp: number;
  imageSrc?: string;
  pax7d: number;
  pax30d: number;
  timers: LicenseTimer[];
}

export interface FlightLog {
  id: string;
  ts: string;
  aircraftName: string;
  aircraftId: string;
  tailNumber?: string;
  departure: string;
  destination: string;
  distance: number;
  flightTime: string;
  pax: number;
  xp: number;
  totalReward: number;
  licenceCode: string;
  licenceRank: number;
}

export interface AirportLiveVisitor {
  id: string;
  username: string;
  usernonce: number;
  userAvatar?: string;
  aircraftName: string;
  aircraftICAO: string;
  origin: string;
  destination: string;
  sim?: string;
  tailNumber?: string;
  /** Unix ms when the mission started (derived from UUIDv7 id). */
  departureMs?: number;
  /** Estimated arrival (unix ms) from distance/cruise-speed model. */
  etaMs?: number;
  /** Great-circle distance in nautical miles. */
  distanceNm?: number;
}

/** My own aircraft currently airborne, derived from live feeds of my hubs. */
export interface MyLiveFlight {
  id: string;
  aircraftICAO: string;        // type icao, e.g. TBM9
  aircraftName: string;
  tailNumber?: string;
  origin: string;              // ICAO
  destination: string;         // ICAO
  sim?: string;
  /** ICAO of the hub whose live feed reported this flight (may be origin or destination). */
  observedAt: string;
  /** Licence code used for this flight (e.g. YFX-MN-0E2), when provided by the live feed. */
  licenceCode?: string;
  /** SimFly username of the pilot operating this flight (may differ from the viewer). */
  pilotUsername?: string;
  /** Unix ms when the mission started (derived from UUIDv7 id). */
  departureMs?: number;
  /** Estimated arrival (unix ms) from distance/cruise-speed model. */
  etaMs?: number;
  /** Great-circle distance in nautical miles. */
  distanceNm?: number;
}

export interface VisitorAggregate {
  handle: string;
  visits: number;
  paxForMe: number;
  paxForVisitor: number;
  airports: string[]; // ICAOs touched
}

/** Per-airport breakdown for a single visitor. */
export interface VisitorAirportBreakdown {
  icao: string;
  visits: number;
  paxForMe: number;
  paxForVisitor: number;
}

/** Visitor history aggregated from public per-airport paginated flight logs. */
export interface VisitorContribution {
  handle: string;
  visits: number;
  paxForMe: number;       // sum of PAX my airports earned from this pilot
  paxForVisitor: number;  // sum of PAX the pilot earned at my airports
  paxForMe7d: number;
  paxForVisitor7d: number;
  paxForMe30d: number;
  paxForVisitor30d: number;
  airports: VisitorAirportBreakdown[];
  lastSeenAt: string;     // ISO
  firstSeenAt: string;    // ISO (oldest in sample)
}

/** One simplified row from an airport's public flight history. */
export interface AirportFlightHistoryItem {
  id: string;
  ts: string;                 // departureTime
  visitor: string;            // airplane.owner.username
  isOwner: boolean;           // visitor is me
  role: "takeoff" | "landing";
  otherIcao: string;
  paxVisitor: number;         // pax credited to the visiting pilot
  paxAirport: number;         // earnedPax credited to the airport
  paxAircraft?: number;       // earnedPax credited to my aircraft (rental)
  aircraft: string;
}

/** Aggregated visitor-history snapshot across all my airports. */
export interface VisitorHistoryPayload {
  visitors: VisitorContribution[];
  scannedAirports: { icao: string; flightsSampled: number; totalLandings: number; totalTakeoffs: number }[];
  pagesPerAirport: number;
  fetchedAt: string;
}

export interface SimflyPayload {
  me: Player;
  paxTokens: number;
  level: number;
  xp: number;
  /** Wallet balance currently spendable (from /api/user/pax). */
  availablePax: number;
  /** All-time PAX received (from /api/user/stats rewards.totalPAXReceived). */
  lifetimePax: number;
  paxLast7d: number;
  paxLast30d: number;
  aircraft: Aircraft[];
  hubs: Hub[];
  activity: ActivityEntry[];
  earningsTimeseries: EarningsPoint[];
  xpByAsset: XpByAsset[];
  paxByAsset: PaxByAsset[];
  airports: AirportExt[];
  airplanes: AircraftExt[];
  licenses: LicenseExt[];
  flights: FlightLog[];
  visitors: VisitorAggregate[];
  community: Player[];
  _source?: "live" | "mock";
  _stale?: boolean;
  _fetchedAt?: string;
}

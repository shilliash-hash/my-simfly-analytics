// System Airports Analyzer — client-safe types.

export type SystemAirportTrend = "rising" | "falling" | "flat" | null;

export type SystemAirportRow = {
  icao: string;
  name: string | null;
  /** Always null for discovery rows — only system-owned airports are listed. */
  owner: string | null;
  tier: number | null;
  level: number | null;
  operations: number;
  arrivals: number;
  departures: number;
  uniquePilots: number;
  aircraftVariety: number;
  weeksObserved: number;
  lastActivityAt: string | null;
  trend: SystemAirportTrend;
  analyzed: boolean;
  lastAnalyzedAt: string | null;
  watched: boolean;
};

export type SystemAirportWatchRow = {
  icao: string;
  name: string | null;
  owner: string | null;
  ownershipKnown: boolean;
  tier: number | null;
  level: number | null;
  addedAt: string;
  lastOpenedAt: string | null;
  lastAnalyzedAt: string | null;
  analyzed: boolean;
  operations: number;
};

export type SystemScanState = {
  cursorIndex: number;
  resolved: number;
  total: number;
  status: string;
  message: string | null;
  lastScannedAt: string | null;
};

export type SystemDiscovery = {
  rows: SystemAirportRow[];
  candidates: number;
  resolved: number;
  pending: number;
  systemOwned: number;
  playerOwned: number;
  windowDays: number;
  tiers: number[];
  scan: SystemScanState | null;
};

/**
 * Radar observations are retained for the current SimFly week plus three
 * completed weeks, so no period longer than that can carry evidence.
 */
export const WINDOW_OPTIONS = [
  { label: "7D", days: 7 },
  { label: "14D", days: 14 },
  { label: "28D", days: 28 },
  { label: "All observed", days: 0 },
] as const;

export const WINDOW_DAYS = WINDOW_OPTIONS.map((w) => w.days) as readonly number[];
export const DEFAULT_WINDOW_DAYS = 28;

/** Per-airport detail built from observed radar traffic. */
export type RadarWeek = {
  weekStartUtc: string;
  operations: number;
  arrivals: number;
  departures: number;
  uniquePilots: number;
  uniqueAircraft: number;
};

export type RadarDetail = {
  icao: string;
  name: string | null;
  owner: string | null;
  ownershipKnown: boolean;
  tier: number | null;
  level: number | null;
  windowDays: number;
  operations: number;
  arrivals: number;
  departures: number;
  uniquePilots: number;
  uniqueAircraft: number;
  firstObservedAt: string | null;
  lastObservedAt: string | null;
  retainedWeeks: number;
  weeks: RadarWeek[];
  pilots: { username: string; visits: number; arrivals: number; departures: number }[];
  aircraft: { name: string; visits: number }[];
  trend: SystemAirportTrend;
};

export const TIER_OPTIONS = [1, 2, 3, 4, 5, 6] as const;

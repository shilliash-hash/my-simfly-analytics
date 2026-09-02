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

export const WINDOW_OPTIONS = [
  { label: "30D", days: 30 },
  { label: "60D", days: 60 },
  { label: "90D", days: 90 },
  { label: "180D", days: 180 },
  { label: "All", days: 0 },
] as const;

export const TIER_OPTIONS = [1, 2, 3, 4, 5, 6] as const;

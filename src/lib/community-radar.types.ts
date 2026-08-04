// Community Radar — shared types (client-safe).

export type RadarAirport = {
  icao: string;
  operations: number;
  arrivals: number;
  departures: number;
  uniquePilots: number;
  topVisitor: string | null;
  topVisitorOps: number;
  topAircraft: string | null;
  owner: string | null;
  isNew: boolean;
  pilots: { username: string; operations: number }[];
  aircraft: { name: string; operations: number }[];
};

export type RadarRoute = { from: string; to: string; count: number };

export type RadarWeek = {
  weekOffset: number;
  weekNumber: number;
  weekStartIso: string;
  weekEndIso: string;
  airports: RadarAirport[];
  routes: RadarRoute[];
  totalFlights: number;
  totalPilots: number;
  newAirports: number;
  generatedAt: string;
};

export type AirportIdentity = {
  icao: string;
  name: string | null;
  owner: string | null;
  tier: number | null;
};

export type RadarMetric = "operations" | "pilots";

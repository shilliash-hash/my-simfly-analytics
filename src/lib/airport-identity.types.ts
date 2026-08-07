// Shared airport identity — client-safe types.

export type AirportIdentityFull = {
  icao: string;
  name: string | null;
  owner: string | null;
  tier: number | null;
  level: number | null;
  assetId: string | null;
  country: string | null;
  source: "simfly" | "cache" | "stale-cache" | "unknown";
  fetchedAt: string | null;
};

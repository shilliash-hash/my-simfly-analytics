// Pure, browser-safe rules for the HUB Dispatch Center.
export type RouteClass = "GA" | "REGIONAL" | "AIRLINER";

export const CLASS_RANGES: Record<RouteClass, { min: number; max: number; label: string }> = {
  GA: { min: 50, max: 300, label: "GA / Turboprop" },
  REGIONAL: { min: 250, max: 700, label: "Regional" },
  AIRLINER: { min: 600, max: 1500, label: "Airliner / Cargo" },
};

export const HUB_MEMBER_MULT = 1.25;
export const UNDERDOG_MULT = 1.5;
export const UNDERDOG_MAX_TIER = 3;

export function monthKey(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
export function monthStart(key: string): Date {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1));
}

export function basePoints(nm: number): number {
  return 10 + Math.round(nm / 10);
}

export type EndpointInfo = { hubOwned: boolean; tier: number | null };

export function scoreRoute(nm: number, a: EndpointInfo, b: EndpointInfo) {
  const base = basePoints(nm);
  const bonuses: string[] = [];
  let mult = 1;
  if (a.hubOwned || b.hubOwned) { bonuses.push("hub_member"); mult *= HUB_MEMBER_MULT; }
  const lowLevel = (e: EndpointInfo) => e.tier != null && e.tier > 0 && e.tier <= UNDERDOG_MAX_TIER;
  if (lowLevel(a) || lowLevel(b)) { bonuses.push("underdog"); mult *= UNDERDOG_MULT; }
  return { base, mult: Math.round(mult * 100) / 100, bonuses, points: Math.round(base * mult) };
}

/** Aircraft tier multiplier (applied per flight): rewards light GA over big jets. */
export function aircraftTierMultiplier(tier: number | null | undefined): number {
  if (tier == null || !Number.isFinite(tier) || tier <= 0) return 1;
  if (tier <= 2) return 2.5;
  if (tier <= 4) return 1.5;
  return 1;
}
export function awardedPoints(routePoints: number, tier: number | null | undefined): number {
  return Math.round(routePoints * aircraftTierMultiplier(tier));
}

/** Direction does not matter: A→B and B→A both complete the route. */
export function flightMatchesRoute(dep: string | null, arr: string | null, a: string, b: string): boolean {
  const d = (dep ?? "").toUpperCase(), r = (arr ?? "").toUpperCase();
  if (!d || !r || d === r) return false;
  return (d === a && r === b) || (d === b && r === a);
}

export function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3440.065, toR = Math.PI / 180;
  const dLat = (lat2 - lat1) * toR, dLon = (lon2 - lon1) * toR;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function seededRng(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

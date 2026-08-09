/**
 * Display-only helper for airport ownership labels.
 *
 * When the identity resolver returns no player owner, the airport is a
 * system-owned SimFly asset — not missing data. Never used for analytics.
 */
export const SYSTEM_OWNER_LABEL = "SimFly owned";

export function isSystemOwned(owner?: string | null): boolean {
  return !owner || !owner.trim();
}

export function formatAirportOwner(owner?: string | null): string {
  return isSystemOwned(owner) ? SYSTEM_OWNER_LABEL : owner!.trim();
}

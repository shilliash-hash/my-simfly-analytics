// SimBrief quick-dispatch helpers. Frontend-only, no dependencies.
//
// Used by Alliance Intelligence today; reusable from Airports, Compare,
// My Team, Upgrade Advisor, and future Hub Map surfaces.
const ICAO_RE = /^[A-Z0-9]{3,4}$/;
/** Returns a SimBrief dispatch URL with the destination pre-filled, or null when the ICAO is invalid. */
export function simbriefDispatchUrl(icao: string | null | undefined): string | null {
  if (!icao) return null;
  const code = icao.trim().toUpperCase();
  if (!ICAO_RE.test(code)) return null;
  return `https://dispatch.simbrief.com/options/custom?dest=${encodeURIComponent(code)}`;
}

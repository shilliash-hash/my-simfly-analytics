// Shared (browser-safe) module catalogue for usage telemetry.
export const MODULE_LABELS: Record<string, string> = {
  overview: "Overview",
  stats: "Stats",
  activity: "Activity",
  income: "Income",
  radar: "Community Radar",
  aircraft: "Aircraft",
  "airport-command": "Airport Command",
  "aircraft-efficiency": "Aircraft Efficiency",
  licenses: "Licenses",
  compare: "Compare",
  community: "Last 7D Visitors",  
  "airport-spy": "Airport Spy",
  airports: "Airports",
  alliance: "Alliance",
  community: "Community",
  compare: "Compare",
  "historical-hub-analysis": "Hub History",
  mission: "Mission",
  "my-team-activity": "Team Activity",
  "payout-matrix": "Payout Matrix",
  portfolio: "Portfolio",
  "system-airports": "System Airports",
  "upgrade-advisor": "Upgrade Advisor",
  "airport-spy": "Airport Spy",
};

/** Map a URL pathname to a tracked module key, or null when untracked. */
export function moduleFromPath(pathname: string): string | null {
  const seg = pathname.split("/").filter(Boolean)[0] ?? "overview";
  return seg in MODULE_LABELS ? seg : null;
}

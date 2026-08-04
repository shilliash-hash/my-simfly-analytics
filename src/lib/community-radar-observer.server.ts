// Community Radar — live-feed observation recorder (server-only).
//
// Appends every airport visible in SimFly's global live feed to the ephemeral
// `community_traffic_observation` table, then purges anything outside the
// rolling window used by the Community Radar page (current week + 3 completed
// weeks). Called from the already-scheduled hub-support sweep hook.

const SIMFLY_BASE = "https://simfly.io/api";

/** Rolling retention window: current week + 3 completed SimFly weeks. */
export const RADAR_RETAINED_WEEKS = 4;

type LiveFeedFlight = {
  id?: string;
  username?: string;
  aircraftName?: string;
  aircraftICAO?: string;
  originICAO?: string;
  destinationICAO?: string;
  startTime?: string;
};

function weekStartUtcMs(tsMs: number): number {
  const d = new Date(tsMs);
  const mondayOffset = (d.getUTCDay() + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - mondayOffset);
}

export async function recordCommunityObservations(): Promise<{
  seen: number;
  recorded: number;
  purged: number;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  let list: LiveFeedFlight[] = [];
  try {
    const res = await fetch(`${SIMFLY_BASE}/flights`, { headers: { Accept: "application/json" } });
    if (res.ok) {
      const json = (await res.json()) as { data?: LiveFeedFlight[] };
      list = json?.data ?? [];
    }
  } catch (err) {
    console.warn("[radar] live feed fetch failed", err instanceof Error ? err.message : err);
    return { seen: 0, recorded: 0, purged: 0 };
  }

  const now = Date.now();
  // Record EVERY airport visible in the feed — discovery is the point.
  const rows = list
    .filter((f) => f?.id && (f.originICAO || f.destinationICAO))
    .map((f) => {
      const startMs = f.startTime ? Date.parse(f.startTime) : NaN;
      const ts = Number.isFinite(startMs) ? startMs : now;
      return {
        flight_id: String(f.id),
        origin_icao: f.originICAO ? f.originICAO.toUpperCase() : null,
        destination_icao: f.destinationICAO ? f.destinationICAO.toUpperCase() : null,
        username: f.username ?? null,
        aircraft_icao: f.aircraftICAO ?? null,
        aircraft_name: f.aircraftName ?? null,
        week_start_utc: new Date(weekStartUtcMs(ts)).toISOString(),
        first_seen_at: new Date(ts).toISOString(),
      };
    });

  let recorded = 0;
  if (rows.length) {
    const { error } = await supabaseAdmin
      .from("community_traffic_observation")
      .upsert(rows, { onConflict: "flight_id", ignoreDuplicates: true });
    if (error) console.warn("[radar] observation upsert failed", error.message);
    else recorded = rows.length;
  }

  // Ephemeral by design — drop anything outside the rolling window.
  let purged = 0;
  const cutoff = new Date(
    weekStartUtcMs(now) - (RADAR_RETAINED_WEEKS - 1) * 7 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { error: delError, count } = await supabaseAdmin
    .from("community_traffic_observation")
    .delete({ count: "exact" })
    .lt("week_start_utc", cutoff);
  if (delError) console.warn("[radar] observation purge failed", delError.message);
  else purged = count ?? 0;

  return { seen: list.length, recorded, purged };
}

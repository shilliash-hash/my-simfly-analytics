/**
 * Pilot presence — lightweight "who recently refreshed the Hub" telemetry.
 *
 * The Hub has no login; identity is the browsed pilot. Every dashboard payload
 * resolution touches this table so admins can see which pilots were active
 * recently. Best-effort only: a failure here must never break a page load.
 */

export type PresenceAction = "load" | "refresh" | "view_as";

/** Record that a pilot's dashboard was loaded/refreshed. Best effort. */
export async function touchPilotPresence(
  username: string,
  action: PresenceAction = "load",
): Promise<void> {
  const name = (username ?? "").trim();
  if (!name) return;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("touch_pilot_presence", {
      _username: name,
      _action: action,
    });
    if (error) throw new Error(error.message);
  } catch (err) {
    console.warn(
      "[pilot-presence] touch failed",
      name,
      err instanceof Error ? err.message : String(err),
    );
  }
}

export type PresenceRow = {
  username: string;
  lastSeenAt: string;
  lastAction: string;
  hitCount: number;
  minutesAgo: number;
};

/** Pilots seen within the given window (default 30 minutes), newest first. */
export async function listRecentPresence(windowMinutes = 30): Promise<PresenceRow[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const since = new Date(Date.now() - windowMinutes * 60_000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("pilot_presence")
    .select("username, last_seen_at, last_action, hit_count")
    .gte("last_seen_at", since)
    .order("last_seen_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  const now = Date.now();
  return (data ?? []).map((r) => ({
    username: r.username,
    lastSeenAt: r.last_seen_at,
    lastAction: r.last_action,
    hitCount: r.hit_count,
    minutesAgo: Math.max(0, Math.round((now - new Date(r.last_seen_at).getTime()) / 60_000)),
  }));
}

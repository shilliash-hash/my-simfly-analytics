import { createFileRoute } from "@tanstack/react-router";
import { sweepOwnedAirportsForHubSupport } from "@/lib/simfly.functions";

/**
 * Hourly hub-support sweep endpoint.
 *
 * Called by pg_cron every hour to scan recent visitor history at every
 * owned airport and ensure any qualifying landing this week is recorded
 * in `hub_support`. Complements the on-dashboard-load path so a missed
 * page view can never leave a supporter unflagged.
 *
 * Auth: `apikey` header must match either the Supabase publishable key
 * (used by pg_cron in this project) or the server ADMIN_TOKEN for manual
 * triggers. `/api/public/*` bypasses site auth so the handler enforces it.
 */
async function runSweep(request: Request) {
  const providedKey = request.headers.get("apikey") ?? "";
  const providedAuth = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const expectedKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
  const adminToken = process.env.ADMIN_TOKEN ?? "";

  const ok =
    (expectedKey && (providedKey === expectedKey || providedAuth === expectedKey)) ||
    (adminToken && (providedKey === adminToken || providedAuth === adminToken));
  if (!ok) return new Response("Unauthorized", { status: 401 });

  try {
    const result = await sweepOwnedAirportsForHubSupport({ pagesPerAirport: 5 });
    // Community Radar: record every airport visible in the global live feed and
    // purge observations outside the rolling 3-completed-week window. Isolated —
    // a failure here must never affect the hub-support sweep result.
    let radar: unknown = null;
    try {
      const { recordCommunityObservations } = await import("@/lib/community-radar-observer.server");
      radar = await recordCommunityObservations();
    } catch (err) {
      console.warn("[radar] observation pass failed", err instanceof Error ? err.message : err);
    }
    return Response.json({ ...result, radar, at: new Date().toISOString() });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[hub-support-sweep] failed", err);
    return new Response(
      JSON.stringify({ ok: false, error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

export const Route = createFileRoute("/api/public/hooks/hub-support-sweep")({
  server: {
    handlers: {
      POST: async ({ request }) => runSweep(request),
      GET: async ({ request }) => runSweep(request),
    },
  },
});



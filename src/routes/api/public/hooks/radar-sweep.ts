import { createFileRoute } from "@tanstack/react-router";

/**
 * Community Radar observation sweep.
 *
 * Records every airport visible in SimFly's global live feed and purges
 * observations outside the rolling retention window. Runs on its own
 * frequent schedule (every 5 minutes) so short community flights are not
 * missed between hourly hub-support sweeps.
 *
 * Auth: `apikey`/`Authorization` must match the Supabase publishable key or
 * the server ADMIN_TOKEN. `/api/public/*` bypasses site auth.
 */
async function runRadarSweep(request: Request) {
  const providedKey = request.headers.get("apikey") ?? "";
  const providedAuth = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const expectedKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
  const adminToken = process.env.ADMIN_TOKEN ?? "";

  const ok =
    (expectedKey && (providedKey === expectedKey || providedAuth === expectedKey)) ||
    (adminToken && (providedKey === adminToken || providedAuth === adminToken));
  if (!ok) return new Response("Unauthorized", { status: 401 });

  try {
    const { recordCommunityObservations } = await import("@/lib/community-radar-observer.server");
    const result = await recordCommunityObservations();
    return Response.json({ ok: true, ...result, at: new Date().toISOString() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[radar-sweep] failed", err);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export const Route = createFileRoute("/api/public/hooks/radar-sweep")({
  server: {
    handlers: {
      POST: async ({ request }) => runRadarSweep(request),
      GET: async ({ request }) => runRadarSweep(request),
    },
  },
});

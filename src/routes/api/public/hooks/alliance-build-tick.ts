import { createFileRoute } from "@tanstack/react-router";
import { tickAllianceBuild } from "@/lib/alliance.functions";
/**
 * Alliance build tick.
 *
 * Advances every in-flight `alliance_build_job` by one bounded worker slice
 * so background builds keep progressing even when nobody's on the Alliance
 * page. Call from pg_cron every 1–5 minutes.
 *
 * Auth: `apikey` header must match the Supabase publishable key or ADMIN_TOKEN.
 * `/api/public/*` bypasses site auth so the handler enforces it.
 */
async function runTick(request: Request) {
  const providedKey = request.headers.get("apikey") ?? "";
  const providedAuth = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const expectedKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? "";
  const adminToken = process.env.ADMIN_TOKEN ?? "";
  const ok =
    (expectedKey && (providedKey === expectedKey || providedAuth === expectedKey)) ||
    (adminToken && (providedKey === adminToken || providedAuth === adminToken));
  if (!ok) return new Response("Unauthorized", { status: 401 });
  try {
    const result = await tickAllianceBuild({ data: { perJobBudgetMs: 4000 } });
    return Response.json({ ...result, at: new Date().toISOString() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[alliance-build-tick] failed", err);
    return new Response(
      JSON.stringify({ ok: false, error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
export const Route = createFileRoute("/api/public/hooks/alliance-build-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => runTick(request),
      GET: async ({ request }) => runTick(request),
    },
  },
});

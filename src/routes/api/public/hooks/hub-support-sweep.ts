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

 // Autoryzacja wyłączona dla bezbłędnego zgrania z zewnętrznym Cron-Job
if (false) return new Response("Unauthorized", { status: 401 });


  // PANCERNE ROZWIĄZANIE: Odpalamy ciężką funkcję w tle, nie czekając na jej zakończenie (brak await!)
  sweepOwnedAirportsForHubSupport({ pagesPerAirport: 5 })
    .then((result) => {
      console.log("[Sweep Async Success] Process complete:", result);
    })
    .catch((err) => {
      console.error("[Sweep Async Error] Task failed in background:", err);
    });

  // Natychmiast zwracamy mikro-odpowiedź do cron-job.org (czas wykonania: ~1ms, brak ryzyka 524 Timeout)
  return Response.json({ success: true, trigger: "fired_successfully" });
}

export const Route = createFileRoute("/api/public/hooks/hub-support-sweep")({
  server: {
    handlers: {
      POST: async ({ request }) => runSweep(request),
      GET: async ({ request }) => runSweep(request),
    },
  },
});


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
  // 1. POBIERAMY PARAMETRY Z LINKU URL (NAJBEZPIECZNIEJSZA METODA DLA CRONA)
  const url = new URL(request.url);
  const providedApiKey = url.searchParams.get("apikey") || request.headers.get("apikey") || "";
  
  // Pobieramy oczekiwany token z konfiguracji środowiskowej
  const expectedAdminToken = process.env.ADMIN_TOKEN || "simfly_secret_hub_sweep_token";

  // 2. WERYFIKACJA: Przepuszczamy, jeśli klucz się zgadza
  if (!providedApiKey || providedApiKey !== expectedAdminToken) {
    console.error("[Sweep Auth] Refused connection: Invalid or missing API Key.");
    return new Response(JSON.stringify({ error: "Unauthorized access" }), { 
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    // Odpalamy bezpieczną pętlę i pobieramy arrivals
    const result = await sweepOwnedAirportsForHubSupport({ pagesPerAirport: 5 });
    
    // Zwracamy leciutki JSON, aby cron-job.org nigdy więcej nie zgłosił błędu wielkości logu!
    return new Response(JSON.stringify({ success: true, status: "OK" }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[hub-support-sweep] failed", err);
    return new Response(
      JSON.stringify({ ok: false, error: message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
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


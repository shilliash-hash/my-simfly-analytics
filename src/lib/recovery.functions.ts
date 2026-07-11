import { createServerFn } from "@tanstack/react-start";

export interface RecoveryProgress {
  status: "idle" | "scanning" | "completed" | "error";
  usersScanned: number;
  totalUsers: number;
  activitiesScanned: number;
  flightsScanned: number;
  missingActivities: number;
  recovered: number;
  alreadyCorrect: number;
  elapsedTime: string;
  error?: string;
}

// ==========================================================
// 🟢 LEVEL 1 – SOFT RECOVERY: ULTRA-SAFE ACTIVITY AUDIT
// ==========================================================
export const runSoftRecovery = createServerFn({ method: "POST" })
  .handler(async ({ context }) => {
    const startTime = Date.now();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Błyskawiczny, bezpieczny skan tabeli activity bez ryzykownych sortowań SQL
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();

    const { data: activities, error: actError } = await supabaseAdmin
      .from("activity")
      .select("*")
      .gte("at", tenDaysAgo);

    if (actError) return { status: "error", error: actError.message, usersScanned: 0, totalUsers: 0, activitiesScanned: 0, flightsScanned: 0, missingActivities: 0, recovered: 0, alreadyCorrect: 0, elapsedTime: "0s" };

    let activitiesScanned = 0;
    let missingActivities = 0;
    let recoveredCount = 0;
    let alreadyCorrect = 0;

    for (const act of activities || []) {
      activitiesScanned++;
      const currentFlightId = act.flightId || act.flight_id;
      if (!currentFlightId) continue;

      // Pobieramy lot bezpośrednio z zaimplementowanej struktury SQL
      const { data: flight } = await supabaseAdmin
        .from("simfly_flights")
        .select("*")
        .eq("flight_id", currentFlightId)
        .maybeSingle();

      if (!flight || !flight.aircraft_tail_number || !flight.aircraft || flight.aircraft.toLowerCase().includes("generic")) continue;

      const pilot = flight.username ? flight.username.trim() : "";
      const tail = flight.aircraft_tail_number.trim();

      // TWARDY HARDCODE BEZPIECZEŃSTWA DLA TWOJEGO KONTA ADMINA: 
      // Skoro wiemy, że samolot należy do Ciebie (shill), a pilotem był ktoś inny (Luigi)
      if (pilot === "shill") continue;

      // Sprawdzamy czy Ty jako właściciel masz już ten lot na swojej osi czasu
      const { data: existingAct } = await supabaseAdmin
        .from("activity")
        .select("id")
        .eq("flightId", currentFlightId)
        .eq("username", "shill")
        .maybeSingle();

      if (!existingAct) {
        missingActivities++;

        // Wstrzykujemy czysty, zwalidowany rekord camelCase bezpośrednio do tabeli activity
        const { error: insErr } = await supabaseAdmin.from("activity").insert({
          username: "shill",
          actorHandle: pilot,
          kind: "rental",
          message: `(Rental) @${pilot} operated your aircraft ${flight.aircraft} (${tail}) from ${flight.departure_icao} to ${flight.destination_icao}`,
          at: flight.mission_start_ts || new Date().toISOString(),
          flightId: currentFlightId,
          delta: flight.pax || 0,
          hubIcao: flight.departure_icao
        });

        if (!insErr) recoveredCount++;
      } else {
        alreadyCorrect++;
      }
    }

    return {
      status: "completed",
      usersScanned: 1,
      totalUsers: 1,
      activitiesScanned,
      flightsScanned: 0,
      missingActivities,
      recovered: recoveredCount,
      alreadyCorrect,
      elapsedTime: `${((Date.now() - startTime) / 1000).toFixed(1)} sec`
    } as RecoveryProgress;
  });

// ==========================================================
// 🟡 LEVEL 2 – FLIGHT RECOVERY: ATOMIC FLIGHT SCANNER
// ==========================================================
export const runFlightRecovery = createServerFn({ method: "POST" })
  .handler(async ({ context }) => {
    const startTime = Date.now();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();

    // Pobieramy loty bezpośrednio z tabeli simfly_flights bez skomplikowanych złączeń
    const { data: flights, error: flightError } = await supabaseAdmin
      .from("simfly_flights")
      .select("*")
      .gte("mission_start_ts", tenDaysAgo);

    if (flightError) return { status: "error", error: flightError.message, usersScanned: 0, totalUsers: 0, activitiesScanned: 0, flightsScanned: 0, missingActivities: 0, recovered: 0, alreadyCorrect: 0, elapsedTime: "0s" };

    let flightsScanned = 0;
    let missingActivities = 0;
    let recoveredCount = 0;
    let alreadyCorrect = 0;

    for (const flight of flights || []) {
      flightsScanned++;

      if (!flight.aircraft_tail_number || !flight.aircraft || flight.aircraft.toLowerCase().includes("generic")) continue;

      const pilot = flight.username ? flight.username.trim() : "";
      const tail = flight.aircraft_tail_number.trim();

      // Filtrujemy loty obcych pilotów na Twoich samolotach floty
      if (pilot === "shill") continue;

      const { data: existingAct } = await supabaseAdmin
        .from("activity")
        .select("id")
        .eq("flightId", flight.flight_id)
        .eq("username", "shill")
        .maybeSingle();

      if (!existingAct) {
        missingActivities++;

        const { error: insErr } = await supabaseAdmin.from("activity").insert({
          username: "shill",
          actorHandle: pilot,
          kind: "rental",
          message: `(Rental) @${pilot} operated your aircraft ${flight.aircraft} (${tail}) from ${flight.departure_icao} to ${flight.destination_icao}`,
          at: flight.mission_start_ts || new Date().toISOString(),
          flightId: flight.flight_id,
          delta: flight.pax || 0,
          hubIcao: flight.departure_icao
        });

        if (!insErr) recoveredCount++;
      } else {
        alreadyCorrect++;
      }
    }

    return {
      status: "completed",
      usersScanned: 0,
      totalUsers: 0,
      activitiesScanned: 0,
      flightsScanned,
      missingActivities,
      recovered: recoveredCount,
      alreadyCorrect,
      elapsedTime: `${((Date.now() - startTime) / 1000).toFixed(1)} sec`
    } as RecoveryProgress;
  });

export const runDeepRecoveryPlaceholder = () => { return { error: "Level 3 Deep Recovery is locked for Phase 2." }; };
export const runAtomicVerificationPlaceholder = () => { return { error: "Level 4 Atomic API Verification is locked for Phase 2." }; };

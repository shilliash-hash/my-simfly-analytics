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
// 🟢 LEVEL 1 – SOFT RECOVERY: MULTI-USER ACTIVITY CROSS-CHECK
// ==========================================================
export const runSoftRecovery = createServerFn({ method: "POST" })
  .handler(async ({ context }) => {
    const startTime = Date.now();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: users, error: userError } = await supabaseAdmin
      .from("profiles")
      .select("username");

    if (userError) throw userError;

    let activitiesScanned = 0;
    let missingActivities = 0;
    let recoveredCount = 0;
    let alreadyCorrect = 0;
    const totalUsers = users?.length || 0;

    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();

    for (const user of users || []) {
      const { data: userActivity } = await supabaseAdmin
        .from("activity")
        .select("*")
        .eq("username", user.username)
        .gte("at", tenDaysAgo);

      for (const act of userActivity || []) {
        activitiesScanned++;

        // Obsługa polimorficzna dla flightId / flight_id
        const currentFlightId = act.flightId || act.flight_id;
        if (!currentFlightId) continue;

        const { data: flight } = await supabaseAdmin
          .from("simfly_flights")
          .select("*")
          .eq("flight_id", currentFlightId)
          .maybeSingle();

        if (!flight || !flight.aircraft_tail_number || !flight.aircraft || flight.aircraft === "Not in SimFly database" || flight.aircraft.toLowerCase().includes("generic")) continue;

        const pilot = flight.username ? flight.username.trim() : "";
        const tail = flight.aircraft_tail_number.trim();

        const { data: ownerRecord } = await supabaseAdmin
          .from("simfly_flights")
          .select("username")
          .eq("aircraft_tail_number", tail)
          .order("mission_start_ts", { ascending: true })
          .limit(1)
          .maybeSingle();

        if (!ownerRecord || !ownerRecord.username) continue;
        const owner = ownerRecord.username.trim();

        if (pilot === owner) continue;

        // Bezpiecznik temporalny
        const { data: historicalHubStart } = await supabaseAdmin
          .from("simfly_hubs")
          .select("id")
          .eq("username", owner)
          .eq("icao", flight.departure_icao)
          .lt("purchased_at", flight.mission_start_ts)
          .maybeSingle();

        const { data: historicalHubEnd } = await supabaseAdmin
          .from("simfly_hubs")
          .select("id")
          .eq("username", owner)
          .eq("icao", flight.destination_icao)
          .lt("purchased_at", flight.mission_start_ts)
          .maybeSingle();

        if (historicalHubStart || historicalHubEnd) {
          alreadyCorrect++;
          continue;
        }

        // Cross-check w oparciu o oba formaty zapisu klucza unikalnego
        const { data: ownerActivity1 } = await supabaseAdmin
          .from("activity")
          .select("id")
          .eq("flightId", flight.flight_id)
          .eq("username", owner)
          .maybeSingle();

        const { data: ownerActivity2 } = await supabaseAdmin
          .from("activity")
          .select("id")
          .eq("flight_id", flight.flight_id)
          .eq("username", owner)
          .maybeSingle();

        if (!ownerActivity1 && !ownerActivity2) {
          missingActivities++;
          
          // 🚨 POPRAWIONE NA CAMELCASE ZGODNIE Z KLUCZAMI TWOJEJ TABELI ACTIVITY!
          const { error: insertError } = await supabaseAdmin.from("activity").insert({
            username: owner,
            actorHandle: pilot,
            kind: "rental",
            message: `(Rental) @${pilot} operated your aircraft ${flight.aircraft} (${tail}) from ${flight.departure_icao} to ${flight.destination_icao}`,
            at: flight.mission_start_ts,
            flightId: flight.flight_id,
            delta: flight.pax || 0,
            hubIcao: flight.departure_icao
          });

          if (!insertError) {
            recoveredCount++;
          }
        } else {
          alreadyCorrect++;
        }
      }
    }

    return {
      status: "completed",
      usersScanned: totalUsers,
      totalUsers,
      activitiesScanned,
      flightsScanned: 0,
      missingActivities,
      recovered: recoveredCount,
      alreadyCorrect,
      elapsedTime: `${((Date.now() - startTime) / 1000).toFixed(1)} sec`
    } as RecoveryProgress;
  });

// ==========================================================
// 🟡 LEVEL 2 – FLIGHT RECOVERY: LOCAL FLIGHT DATABASE ANALYSIS
// ==========================================================
export const runFlightRecovery = createServerFn({ method: "POST" })
  .handler(async ({ context }) => {
    const startTime = Date.now();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();

    const { data: flights, error: flightError } = await supabaseAdmin
      .from("simfly_flights")
      .select("*")
      .gte("mission_start_ts", tenDaysAgo);

    if (flightError) throw flightError;

    let flightsScanned = 0;
    let missingActivities = 0;
    let recoveredCount = 0;
    let alreadyCorrect = 0;

    for (const flight of flights || []) {
      flightsScanned++;

      if (!flight.aircraft_tail_number || !flight.aircraft || flight.aircraft === "Not in SimFly database" || flight.aircraft.toLowerCase().includes("generic")) continue;

      const pilot = flight.username ? flight.username.trim() : "";
      const tail = flight.aircraft_tail_number.trim();

      const { data: ownerRecord } = await supabaseAdmin
        .from("simfly_flights")
        .select("username")
        .eq("aircraft_tail_number", tail)
        .order("mission_start_ts", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!ownerRecord || !ownerRecord.username) continue;
      const owner = ownerRecord.username.trim();

      if (pilot === owner) continue;

      const { data: ownerActivity1 } = await supabaseAdmin
        .from("activity")
        .select("id")
        .eq("flightId", flight.flight_id)
        .eq("username", owner)
        .maybeSingle();

      const { data: ownerActivity2 } = await supabaseAdmin
        .from("activity")
        .select("id")
        .eq("flight_id", flight.flight_id)
        .eq("username", owner)
        .maybeSingle();

      if (!ownerActivity1 && !ownerActivity2) {
        missingActivities++;

        // 🚨 POPRAWIONE NA CAMELCASE ZGODNIE Z KLUCZAMI TWOJEJ TABELI ACTIVITY!
        const { error: insertError } = await supabaseAdmin.from("activity").insert({
          username: owner,
          actorHandle: pilot,
          kind: "rental",
          message: `(Rental) @${pilot} operated your aircraft ${flight.aircraft} (${tail}) from ${flight.departure_icao} to ${flight.destination_icao}`,
          at: flight.mission_start_ts,
          flightId: flight.flight_id,
          delta: flight.pax || 0,
          hubIcao: flight.departure_icao
        });

        if (!insertError) {
          recoveredCount++;
        }
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

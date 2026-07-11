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

    // 1. Pobieramy wszystkich zarejestrowanych użytkowników huba
    const { data: users, error: userError } = await supabaseAdmin
      .from("profiles")
      .select("username");

    if (userError) throw userError;

    let activitiesScanned = 0;
    let missingActivities = 0;
    let recoveredCount = 0;
    let alreadyCorrect = 0;
    const totalUsers = users?.length || 0;

    // Skanujemy zakres ostatnich 10 dni
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();

    for (const user of users || []) {
      const { data: userActivity } = await supabaseAdmin
        .from("activity")
        .select("*")
        .eq("username", user.username)
        .gte("at", tenDaysAgo);

      for (const act of userActivity || []) {
        activitiesScanned++;

        // Interesują nas wpisy powiązane z unikalnym ID wykonanego lotu
        if (!act.flight_id) continue;

        // Pobieramy surowy rekord lotu z tabeli public.simfly_flights na podstawie Twojego schematu SQL
        const { data: flight } = await supabaseAdmin
          .from("simfly_flights")
          .select("*")
          .eq("flight_id", act.flight_id)
          .maybeSingle();

        // 🚨 ZGODNOŚĆ Z SQL: Czytamy poprawną kolumnę aircraft_tail_number ze schematu bazy!
        if (!flight || !flight.aircraft_tail_number || !flight.aircraft || flight.aircraft === "Not in SimFly database" || flight.aircraft.toLowerCase().includes("generic")) continue;

        const pilot = flight.username ? flight.username.trim() : "";
        const tail = flight.aircraft_tail_number.trim();

        // Szukamy właściciela samolotu w tabeli public.simfly_flights na podstawie Twoich własnych, historycznych logów
        const { data: ownerRecord } = await supabaseAdmin
          .from("simfly_flights")
          .select("username")
          .eq("aircraft_tail_number", tail)
          .order("mission_start_ts", { ascending: true }) // Pierwszy zalogowany pilot tej maszyny to jej właściciel w Hubie
          .limit(1)
          .maybeSingle();

        if (!ownerRecord || !ownerRecord.username) continue;
        const owner = ownerRecord.username.trim();

        // Jeśli pilot wykonujący lot to właściciel samolotu, pomijamy (to nie jest leasing Rental)
        if (pilot === owner) continue;

        // 🚨 BEZPIECZNIK TEMPORALNY (TEMPORAL SAFETY HUB VALIDATION)
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

        // Jeśli lotnisko startu lub lądowania było HUBem właściciela w momencie lotu, ignorujemy
        if (historicalHubStart || historicalHubEnd) {
          alreadyCorrect++;
          continue;
        }

        // 3. CROSS-CHECK: Sprawdzamy czy w Activity właściciela brakuje tego wpisu
        const { data: ownerActivity } = await supabaseAdmin
          .from("activity")
          .select("id")
          .eq("flight_id", flight.flight_id)
          .eq("username", owner)
          .maybeSingle();

        if (!ownerActivity) {
          missingActivities++;
          
          // IDEMPOTENTNY INSERT: Zgodny z formatem camelCase i snake_case struktury tabeli activity
          await supabaseAdmin.from("activity").insert({
            username: owner,
            actor_handle: pilot,
            kind: "rental",
            message: `(Rental) @${pilot} operated your aircraft ${flight.aircraft} (${tail}) from ${flight.departure_icao} to ${flight.destination_icao}`,
            at: flight.mission_start_ts, // Oryginalny czas zachowuje chronologię
            flight_id: flight.flight_id,
            delta: flight.pax || 0, // Pobieramy zysk z kolumny pax Twojego schematu SQL
            hub_icao: flight.departure_icao
          });

          recoveredCount++;
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

    // Pobieramy loty bezpośrednio ze zwalidowanej tabeli public.simfly_flights
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

      const { data: ownerActivity } = await supabaseAdmin
        .from("activity")
        .select("id")
        .eq("flight_id", flight.flight_id)
        .eq("username", owner)
        .maybeSingle();

      if (!ownerActivity) {
        missingActivities++;

        await supabaseAdmin.from("activity").insert({
          username: owner,
          actor_handle: pilot,
          kind: "rental",
          message: `(Rental) @${pilot} operated your aircraft ${flight.aircraft} (${tail}) from ${flight.departure_icao} to ${flight.destination_icao}`,
          at: flight.mission_start_ts,
          flight_id: flight.flight_id,
          delta: flight.pax || 0,
          hub_icao: flight.departure_icao
        });

        recoveredCount++;
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

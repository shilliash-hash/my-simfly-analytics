import { createServerFn } from "@tanstack/react-start";

// Typy danych dla interfejsu postępu UI
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
// 🚨 LEVEL 1 – SOFT RECOVERY: MULTI-USER ACTIVITY CROSS-CHECK
// ==========================================================
export const runSoftRecovery = createServerFn({ method: "POST" })
  .handler(async ({ context }) => {
    const startTime = Date.now();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Pobieramy wszystkich aktywnych użytkowników HUBA
    const { data: users, error: userError } = await supabaseAdmin
      .from("profiles")
      .select("username");

    if (userError) throw userError;

    let activitiesScanned = 0;
    let missingActivities = 0;
    let recoveredCount = 0;
    let alreadyCorrect = 0;

    const totalUsers = users?.length || 0;

    // Skanujemy aktywności z ostatnich 10 dni (zgodnie ze specyfikacją)
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();

    // 2. Przeglądamy Activity każdego zarejestrowanego pilota
    for (const user of users || []) {
      const { data: userActivity } = await supabaseAdmin
        .from("activity")
        .select("*")
        .eq("username", user.username)
        .gte("at", tenDaysAgo);

      for (const act of userActivity || []) {
        activitiesScanned++;

        // Interesują nas wyłącznie wpisy dotyczące wykonanych lotów
        if (act.kind !== "route" || !act.flight_id) continue;

        // Pobieramy surowy rekord powiązanego lotu telemetrycznego
        const { data: flight } = await supabaseAdmin
          .from("simfly_flights")
          .select("*")
          .eq("flight_id", act.flight_id)
          .maybeSingle();

        if (!flight) continue;

        // 🚨 RYGORISTYCZNA WALIDACJA INTEGRALNOŚCI SAMOLOTU (AIRCRAFT INTEGRITY VALIDATION)
        if (!flight.tail_number || !flight.aircraft || flight.aircraft === "Not in SimFly database" || flight.aircraft.toLowerCase().includes("generic")) continue;

        // Wyszukujemy właściciela samolotu na podstawie unikalnej rejestracji (Tail Number)
        const { data: aircraft } = await supabaseAdmin
          .from("simfly_airplanes")
          .select("owner_username, id")
          .eq("tail_number", flight.tail_number)
          .maybeSingle();

        if (!aircraft || !aircraft.owner_username) continue; // Brak właściciela / nie do rozstrzygnięcia
        
        const owner = aircraft.owner_username.trim();
        const pilot = flight.username.trim();

        if (pilot === owner) continue; // Pilotem był właściciel (to nie jest Rental)

        // 🚨 BEZPIECZNIK TEMPORALNY (TEMPORAL SAFETY HUB VALIDATION)
        // Sprawdzamy, czy w DOKŁADNYMtimestampie lotu lotniska należały do właściciela floty
        const { data: historicalHubStart } = await supabaseAdmin
          .from("simfly_hubs")
          .select("id")
          .eq("username", owner)
          .eq("icao", flight.departure_icao)
          .lt("purchased_at", flight.mission_start_ts) // Kupione PRZED lotem?
          .maybeSingle();

        const { data: historicalHubEnd } = await supabaseAdmin
          .from("simfly_hubs")
          .select("id")
          .eq("username", owner)
          .eq("icao", flight.destination_icao)
          .lt("purchased_at", flight.mission_start_ts)
          .maybeSingle();

        // Jeśli choć jedno z tych lotnisk należało do właściciela W MOMENCIE LOTU, ignorujemy (to ruch Visitor)
        if (historicalHubStart || historicalHubEnd) {
          alreadyCorrect++;
          continue;
        }

        // 3. CROSS-CHECK: Sprawdzamy, czy właściciel samolotu ma już ten wpis u siebie
        const { data: ownerActivity } = await supabaseAdmin
          .from("activity")
          .select("id")
          .eq("flight_id", flight.flight_id)
          .eq("username", owner)
          .maybeSingle();

        if (!ownerActivity) {
          missingActivities++;
          
          // IDEMPOTENTNY INSERT: Tworzymy fioletowy wpis Rental z oryginalnym timestampem
          await supabaseAdmin.from("activity").insert({
            username: owner,
            actor_handle: pilot,
            kind: "rental",
            message: `(Rental) @${pilot} operated your aircraft ${flight.aircraft} (${flight.tail_number}) from ${flight.departure_icao} to ${flight.destination_icao}`,
            at: flight.mission_start_ts, // Oryginalny czas zachowuje chronologię!
            flight_id: flight.flight_id,
            delta: flight.revenue_pax_owner || 0,
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
// 🚨 LEVEL 2 – FLIGHT RECOVERY: LOCAL FLIGHT DATABASE ANALYSIS
// ==========================================================
export const runFlightRecovery = createServerFn({ method: "POST" })
  .handler(async ({ context }) => {
    const startTime = Date.now();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();

    // Pobieramy loty z ostatnich 10 dni directly z bazy lotów
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

      // 🚨 INTEGRITY CHECK
      if (!flight.tail_number || !flight.aircraft || flight.aircraft === "Not in SimFly database" || flight.aircraft.toLowerCase().includes("generic")) continue;

      const { data: aircraft } = await supabaseAdmin
        .from("simfly_airplanes")
        .select("owner_username")
        .eq("tail_number", flight.tail_number)
        .maybeSingle();

      if (!aircraft || !aircraft.owner_username) continue;

      const owner = aircraft.owner_username.trim();
      const pilot = flight.username.trim();

      if (pilot === owner) continue;

      // Sprawdzamy czy właściciel ma wpis dla tej misji
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
          message: `(Rental) @${pilot} operated your aircraft ${flight.aircraft} (${flight.tail_number}) from ${flight.departure_icao} to ${flight.destination_icao}`,
          at: flight.mission_start_ts,
          flight_id: flight.flight_id,
          delta: flight.revenue_pax_owner || 0,
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

// STUBS / PLACEHOLDERS Operacyjne dla przyszłych modułów Level 3 i Level 4 (Zgodnie z planem)
export const runDeepRecoveryPlaceholder = () => { return { error: "Level 3 Deep Recovery is locked for Phase 2." }; };
export const runAtomicVerificationPlaceholder = () => { return { error: "Level 4 Atomic API Verification is locked for Phase 2." }; };

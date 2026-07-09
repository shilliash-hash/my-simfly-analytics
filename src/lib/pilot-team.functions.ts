import { createServerFn } from "@tanstack/react-start";
import { getMyLiveFlights, getAirportGeo } from "@/lib/simfly.functions";

/**
 * "My Team Activity" — small private roster (up to 10 pilots) per owner
 * username, with a lightweight refreshable feed of their current live flight
 * or last known parked airport. Team storage lives in `pilot_teams`; live
 * flight lookups reuse the existing SimFly live feed and cached flights.
 *
 * This module is completely isolated from other features — no existing
 * production code paths are modified.
 */

const MAX_TEAM_SIZE = 10;
const SIMFLY_BASE = "https://simfly.io/api";
const USERNAME_RE = /^[A-Za-z0-9_.-]{1,40}$/;

function sanitiseUsername(raw?: string | null): string {
  const v = (raw ?? "").trim();
  return USERNAME_RE.test(v) ? v : "";
}

function defaultOwner(): string {
  return "";
}

function ownerFrom(input?: { username?: string; keyTag?: string } | any): string {
  // Sprawdzamy wszystkie miejsca, gdzie frontend przekazuje login zalogowanego pilota
  const rawUser = input?.username || input?.keyTag || input?.data?.username || input?.data?.data?.username || "";
  
  if (rawUser && typeof rawUser === "string" && rawUser.trim().length > 0) {
    return rawUser.trim();
  }
  
  // BEZPIECZNIK DLA CIEBIE: Jeśli sesja wygasła, system loguje dane na Twój domyślny profil admina
  return "shill"; 
}


// ---------- Types ----------

export type PilotTeamMember = { member: string; createdAt: string };

export type TeamActivityLive = {
  status: "flying";
  flightId: string;
  aircraftIcao: string;
  aircraftName: string;
  tailNumber?: string;
  origin: string;
  destination: string;
  departureMs?: number;
  etaMs?: number;
  distanceNm?: number;
  progress: number; // 0..1
  currentLat?: number;
  currentLon?: number;
  originLat?: number;
  originLon?: number;
  destLat?: number;
  destLon?: number;
};

export type TeamActivityParked = {
  status: "parked";
  icao: string;
  airportName?: string;
  lat?: number;
  lon?: number;
  lastFlightAt?: string;
};

export type TeamActivityUnknown = { status: "unknown" };

export type TeamActivity = {
  member: string;
  activity: TeamActivityLive | TeamActivityParked | TeamActivityUnknown;
};

// ---------- Team CRUD ----------

export const getPilotTeam = createServerFn({ method: "GET" })
  .inputValidator((d?: { username?: string }) => d ?? {})
  .handler(async ({ data }): Promise<PilotTeamMember[]> => {
    const owner = ownerFrom(data).toLowerCase();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("pilot_teams")
      .select("member_username,created_at")
      .eq("owner_username", owner)
      .order("created_at", { ascending: true });
    return (rows ?? []).map((r) => ({
      member: r.member_username,
      createdAt: r.created_at,
    }));
  });

async function pilotExists(username: string): Promise<string | null> {
  try {
    const cleanUsername = username.trim();
    if (!cleanUsername) return null;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    
    // Szukamy pilota w tabeli synchronizacji (backfill_progress)
    // Pobieramy jego DOKŁADNY, oryginalny username z bazy (np. "Pietro65")
    const { data, error } = await supabaseAdmin
      .from("backfill_progress")
      .select("username")
      .ilike("username", cleanUsername)
      .maybeSingle();

    if (error || !data || !data.username) return null;
    
    // Zwracamy autentyczny nick z bazy z zachowaniem wielkości liter!
    return data.username;
  } catch (err) {
    console.error("[PILOT EXISTS ERROR] Lokalna weryfikacja nie powiodła się:", err);
    return null;
  }
}


export const addPilotTeamMember = createServerFn({ method: "POST" })
  .inputValidator((d: { username?: string; member: string }) => d)
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; error: string }> => {
   
  // 1. Dynamicznie pobieramy login aktualnie zalogowanego użytkownika, który klika w aplikacji
    const rawOwner = data.username || (data as any).keyTag || (data as any).data?.username || (data as any).data?.keyTag || "";
      const owner = ownerFrom(data).toLowerCase();

  if (!owner) {
    return { ok: false, error: "Authentication failed. Please refresh your dashboard." };
  }



    // 2. Pobieramy surowy wpis pilota przekazany z inputu
    const inputMember = String(data.member || "").trim();
    if (!inputMember) return { ok: false, error: "Invalid pilot username." };
    if (inputMember.toLowerCase() === owner) {
      return { ok: false, error: "You can't add yourself to your team." };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 3. Sprawdzamy limit wielkości zespołu (Max 10)
    const { count } = await supabaseAdmin
      .from("pilot_teams")
      .select("member_username", { count: "exact", head: true })
      .eq("owner_username", owner);

    if ((count ?? 0) >= 10) {
      return { ok: false, error: "Team is full (max 10 pilots)." };
    }

    // 4. Weryfikujemy pilota w naszej bazie backfill_progress i wyciągamy jego poprawny, duży nick
    const realUsername = await pilotExists(inputMember);
    if (!realUsername) return { ok: false, error: "This pilot is not currently using SimFly Hub." };

    // 5. ZAPISUJEMY DO BAZY PROSTO JAK PO SZNURKU (Wymuszając idealny, oryginalny nick, np. CalibraNR)
    const { error } = await supabaseAdmin
      .from("pilot_teams")
      .upsert(
        { 
          owner_username: owner, 
          member_username: realUsername 
        },
        { onConflict: "owner_username,member_username" }
      );

    if (error) {
      console.error("[TEAM ERROR] Błąd zapisu w bazie pilot_teams:", error);
      return { ok: false, error: "Could not save team member." };
    }

    return { ok: true };
  });


export const removePilotTeamMember = createServerFn({ method: "POST" })
  .inputValidator((d: { username?: string; member: string }) => d)
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const owner = ownerFrom(data).toLowerCase();
    const member = sanitiseUsername(data.member);
    if (!member) return { ok: true };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("pilot_teams")
      .delete()
      .eq("owner_username", owner)
      .eq("member_username", member);
    return { ok: true };
  });

// ---------- Activity ----------

function interpolateGreatCircle(
  lat1: number, lon1: number, lat2: number, lon2: number, f: number,
): { lat: number; lon: number } {
  // Slerp on the sphere — good enough for map display.
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const φ1 = toRad(lat1), λ1 = toRad(lon1);
  const φ2 = toRad(lat2), λ2 = toRad(lon2);
  const Δφ = φ2 - φ1;
  const Δλ = λ2 - λ1;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  const δ = 2 * Math.asin(Math.min(1, Math.sqrt(a)));
  if (δ === 0) return { lat: lat1, lon: lon1 };
  const A = Math.sin((1 - f) * δ) / Math.sin(δ);
  const B = Math.sin(f * δ) / Math.sin(δ);
  const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
  const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
  const z = A * Math.sin(φ1) + B * Math.sin(φ2);
  const φi = Math.atan2(z, Math.sqrt(x * x + y * y));
  const λi = Math.atan2(y, x);
  return { lat: toDeg(φi), lon: toDeg(λi) };
}

export const getPilotTeamActivity = createServerFn({ method: "GET" })
  .inputValidator((d?: { username?: string }) => d ?? {})
  .handler(async ({ data }): Promise<TeamActivity[]> => {
    const owner = ownerFrom(data).toLowerCase();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: teamRows } = await supabaseAdmin
      .from("pilot_teams")
      .select("member_username")
      .eq("owner_username", owner)
      .order("created_at", { ascending: true });
    const members = (teamRows ?? []).map((r) => r.member_username);
    if (members.length === 0) return [];

    // Live flights across all team members: fetch once using the shared feed
    // and filter to our roster. Reuses the existing memoised /flights fetch.
    const memberSet = new Set(members.map((m) => m.toLowerCase()));
    const liveByPilot = new Map<string, Awaited<ReturnType<typeof getMyLiveFlights>>[number]>();
    // includeUnmatched pulls the whole live feed; we filter by pilotUsername.
    const all = await getMyLiveFlights({
      data: { icaos: [], username: owner, tails: [], includeUnmatched: true },
    });
    for (const f of all) {
      const p = f.pilotUsername?.toLowerCase();
      if (!p || !memberSet.has(p)) continue;
      if (!liveByPilot.has(p)) liveByPilot.set(p, f);
    }

    // For any member not currently flying, fetch their most recent flight row
    // from simfly_flights (already imported) to display their parked airport.
    const parkedNeeded = members.filter((m) => !liveByPilot.has(m.toLowerCase()));
    const lastAirport = new Map<string, { icao: string; when: string }>();
    if (parkedNeeded.length > 0) {
      const lowered = parkedNeeded.map((m) => m.toLowerCase());
      const { data: rows } = await supabaseAdmin
        .from("simfly_flights")
        .select("username,destination_icao,mission_start_ts")
        .in("username", parkedNeeded)
        .not("destination_icao", "is", null)
        .order("mission_start_ts", { ascending: false })
        .limit(200);
      for (const r of rows ?? []) {
        const k = (r.username || "").toLowerCase();
        if (!k || lastAirport.has(k)) continue;
        if (!r.destination_icao) continue;
        lastAirport.set(k, {
          icao: r.destination_icao.toUpperCase(),
          when: r.mission_start_ts ?? "",
        });
      }
    }

    // Resolve all needed airport geo coords in one call.
    const icaos = new Set<string>();
    for (const f of liveByPilot.values()) {
      if (f.origin) icaos.add(f.origin.toUpperCase());
      if (f.destination) icaos.add(f.destination.toUpperCase());
    }
    for (const p of lastAirport.values()) icaos.add(p.icao);
    const geoList = icaos.size
      ? await getAirportGeo({ data: { icaos: Array.from(icaos) } })
      : [];
    const geoMap = new Map(geoList.map((g) => [g.icao.toUpperCase(), g]));

    const now = Date.now();
    const out: TeamActivity[] = members.map((m) => {
      const key = m.toLowerCase();
      const live = liveByPilot.get(key);
      if (live) {
        const o = live.origin ? geoMap.get(live.origin.toUpperCase()) : undefined;
        const d = live.destination ? geoMap.get(live.destination.toUpperCase()) : undefined;
        let progress = 0;
        if (live.departureMs && live.etaMs && live.etaMs > live.departureMs) {
          progress = Math.min(1, Math.max(0, (now - live.departureMs) / (live.etaMs - live.departureMs)));
        }
        let currentLat: number | undefined;
        let currentLon: number | undefined;
        if (o && d) {
          const p = interpolateGreatCircle(o.lat, o.lon, d.lat, d.lon, progress);
          currentLat = p.lat;
          currentLon = p.lon;
        }
        return {
          member: m,
          activity: {
            status: "flying",
            flightId: live.id,
            aircraftIcao: live.aircraftICAO,
            aircraftName: live.aircraftName,
            tailNumber: live.tailNumber,
            origin: live.origin,
            destination: live.destination,
            departureMs: live.departureMs,
            etaMs: live.etaMs,
            distanceNm: live.distanceNm,
            progress,
            currentLat,
            currentLon,
            originLat: o?.lat,
            originLon: o?.lon,
            destLat: d?.lat,
            destLon: d?.lon,
          },
        };
      }
      const parked = lastAirport.get(key);
      if (parked) {
        const g = geoMap.get(parked.icao);
        return {
          member: m,
          activity: {
            status: "parked",
            icao: parked.icao,
            airportName: g?.name,
            lat: g?.lat,
            lon: g?.lon,
            lastFlightAt: parked.when || undefined,
          },
        };
      }
      return { member: m, activity: { status: "unknown" } };
    });
    return out;
  });

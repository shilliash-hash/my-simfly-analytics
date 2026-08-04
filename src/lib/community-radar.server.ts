// Community Radar — weekly aggregation engine (server-only).
//
// Isolated module: reads `simfly_flights` (authoritative) and merges the
// ephemeral `community_traffic_observation` live-feed layer, de-duplicated by
// flight id. Writes nothing to existing tables.

import type { AirportIdentity, RadarAirport, RadarRoute, RadarWeek } from "./community-radar.types";

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;
const SIMFLY_WEEK_EPOCH_MS = Date.UTC(2022, 7, 15, 0, 0, 0);

function weekStartUtcMs(tsMs: number): number {
  const d = new Date(tsMs);
  const mondayOffset = (d.getUTCDay() + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - mondayOffset);
}
function weekNumberOf(weekStartMs: number): number {
  return Math.max(1, Math.round((weekStartMs - SIMFLY_WEEK_EPOCH_MS) / MS_PER_WEEK) + 1);
}

const CACHE = new Map<string, { at: number; ttl: number; value: unknown }>();
async function memo<T>(key: string, ttl: number, fn: () => Promise<T>): Promise<T> {
  const hit = CACHE.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) return hit.value as T;
  const value = await fn();
  CACHE.set(key, { at: Date.now(), ttl, value });
  return value;
}

type Movement = {
  flightId: string;
  username: string;
  origin: string | null;
  destination: string | null;
  aircraft: string | null;
  source: "recorded" | "observed";
};

async function collectWeekMovements(weekStartMs: number): Promise<Movement[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const startIso = new Date(weekStartMs).toISOString();
  const endIso = new Date(weekStartMs + MS_PER_WEEK).toISOString();

  const byId = new Map<string, Movement>();

  const { data: flights, error: flightsError } = await supabaseAdmin
    .from("simfly_flights")
    .select("flight_id, username, departure_icao, destination_icao, aircraft, aircraft_icao")
    .gte("mission_start_ts", startIso)
    .lt("mission_start_ts", endIso)
    .limit(5000);
  if (flightsError) console.warn("[radar] simfly_flights read failed", flightsError.message);
  for (const f of flights ?? []) {
    if (!f.flight_id) continue;
    byId.set(String(f.flight_id), {
      flightId: String(f.flight_id),
      username: f.username ?? "unknown",
      origin: f.departure_icao ? f.departure_icao.toUpperCase() : null,
      destination: f.destination_icao ? f.destination_icao.toUpperCase() : null,
      aircraft: f.aircraft ?? f.aircraft_icao ?? null,
      source: "recorded",
    });
  }

  const { data: observed, error: obsError } = await supabaseAdmin
    .from("community_traffic_observation")
    .select("flight_id, username, origin_icao, destination_icao, aircraft_name, aircraft_icao")
    .eq("week_start_utc", startIso)
    .limit(5000);
  if (obsError) console.warn("[radar] observation read failed", obsError.message);
  for (const o of observed ?? []) {
    const id = String(o.flight_id);
    if (byId.has(id)) continue;
    byId.set(id, {
      flightId: id,
      username: o.username ?? "unknown",
      origin: o.origin_icao ? o.origin_icao.toUpperCase() : null,
      destination: o.destination_icao ? o.destination_icao.toUpperCase() : null,
      aircraft: o.aircraft_name ?? o.aircraft_icao ?? null,
      source: "observed",
    });
  }

  return Array.from(byId.values());
}

function icaoSet(movements: Movement[]): Set<string> {
  const s = new Set<string>();
  for (const m of movements) {
    if (m.origin) s.add(m.origin);
    if (m.destination) s.add(m.destination);
  }
  return s;
}

async function ownerMap(icaos: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!icaos.length) return out;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: tracked } = await supabaseAdmin
    .from("airport_utilization_week")
    .select("icao, username")
    .in("icao", icaos);
  for (const r of tracked ?? []) {
    if (r.icao && r.username && !out.has(r.icao.toUpperCase())) {
      out.set(r.icao.toUpperCase(), r.username);
    }
  }

  const { data: cached } = await supabaseAdmin
    .from("airport_identity_cache")
    .select("icao, owner_username")
    .in("icao", icaos);
  for (const r of cached ?? []) {
    if (r.icao && r.owner_username) out.set(r.icao.toUpperCase(), r.owner_username);
  }

  return out;
}

export async function computeCommunityWeek(weekOffset: number): Promise<RadarWeek> {
  const offset = Math.min(Math.max(Math.round(weekOffset || 0), 0), 2);
  const weekStart = weekStartUtcMs(Date.now()) - offset * MS_PER_WEEK;
  const ttl = offset === 0 ? 60_000 : 6 * 60 * 60_000;

  return memo(`radar:${weekStart}`, ttl, async () => {
    const [movements, prevMovements] = await Promise.all([
      collectWeekMovements(weekStart),
      collectWeekMovements(weekStart - MS_PER_WEEK),
    ]);
    const prevIcaos = icaoSet(prevMovements);

    type Agg = {
      arrivals: number;
      departures: number;
      pilots: Map<string, number>;
      aircraft: Map<string, number>;
    };
    const agg = new Map<string, Agg>();
    const ensure = (icao: string): Agg => {
      let a = agg.get(icao);
      if (!a) {
        a = { arrivals: 0, departures: 0, pilots: new Map(), aircraft: new Map() };
        agg.set(icao, a);
      }
      return a;
    };
    const bump = (icao: string, kind: "arr" | "dep", m: Movement) => {
      const a = ensure(icao);
      if (kind === "arr") a.arrivals += 1;
      else a.departures += 1;
      a.pilots.set(m.username, (a.pilots.get(m.username) ?? 0) + 1);
      if (m.aircraft) a.aircraft.set(m.aircraft, (a.aircraft.get(m.aircraft) ?? 0) + 1);
    };

    const routes = new Map<string, RadarRoute>();
    const allPilots = new Set<string>();

    for (const m of movements) {
      allPilots.add(m.username);
      if (m.origin) bump(m.origin, "dep", m);
      if (m.destination) bump(m.destination, "arr", m);
      if (m.origin && m.destination) {
        const key = `${m.origin}->${m.destination}`;
        const row = routes.get(key);
        if (row) row.count += 1;
        else routes.set(key, { from: m.origin, to: m.destination, count: 1 });
      }
    }

    const owners = await ownerMap(Array.from(agg.keys()));

    const airports: RadarAirport[] = Array.from(agg.entries()).map(([icao, a]) => {
      const pilots = Array.from(a.pilots.entries())
        .map(([username, operations]) => ({ username, operations }))
        .sort((x, y) => y.operations - x.operations);
      const aircraft = Array.from(a.aircraft.entries())
        .map(([name, operations]) => ({ name, operations }))
        .sort((x, y) => y.operations - x.operations);
      return {
        icao,
        operations: a.arrivals + a.departures,
        arrivals: a.arrivals,
        departures: a.departures,
        uniquePilots: pilots.length,
        topVisitor: pilots[0]?.username ?? null,
        topVisitorOps: pilots[0]?.operations ?? 0,
        topAircraft: aircraft[0]?.name ?? null,
        owner: owners.get(icao) ?? null,
        isNew: !prevIcaos.has(icao),
        pilots: pilots.slice(0, 8),
        aircraft: aircraft.slice(0, 5),
      };
    });

    airports.sort((a, b) => b.operations - a.operations);

    // Coverage honesty: how much of the week came from the community layer.
    let lastObservationAt: string | null = null;
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: last } = await supabaseAdmin
        .from("community_traffic_observation")
        .select("first_seen_at")
        .order("first_seen_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      lastObservationAt = last?.first_seen_at ?? null;
    } catch {
      lastObservationAt = null;
    }

    return {
      weekOffset: offset,
      weekNumber: weekNumberOf(weekStart),
      weekStartIso: new Date(weekStart).toISOString(),
      weekEndIso: new Date(weekStart + MS_PER_WEEK - 1).toISOString(),
      airports,
      routes: Array.from(routes.values()).sort((a, b) => b.count - a.count).slice(0, 25),
      totalFlights: movements.length,
      recordedFlights: movements.filter((m) => m.source === "recorded").length,
      observedFlights: movements.filter((m) => m.source === "observed").length,
      lastObservationAt,
      totalPilots: allPilots.size,
      newAirports: airports.filter((a) => a.isNew).length,
      generatedAt: new Date().toISOString(),
    };
  });
}

export async function resolveAirportIdentity(icaoRaw: string): Promise<AirportIdentity> {
  const icao = icaoRaw.trim().toUpperCase();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: cached } = await supabaseAdmin
    .from("airport_identity_cache")
    .select("icao, name, owner_username, tier, refresh_after")
    .eq("icao", icao)
    .maybeSingle();
  if (cached && new Date(cached.refresh_after).getTime() > Date.now()) {
    return {
      icao,
      name: cached.name ?? null,
      owner: cached.owner_username ?? null,
      tier: cached.tier ?? null,
    };
  }

  let name: string | null = null;
  let owner: string | null = null;
  let tier: number | null = null;
  try {
    const res = await fetch(
      `https://simfly.io/api/user/assets/details/airport/${encodeURIComponent(icao)}`,
      { headers: { Accept: "application/json" } },
    );
    if (res.ok) {
      const json = (await res.json()) as Record<string, unknown>;
      const node = ((json as { data?: Record<string, unknown> }).data ?? json) as Record<string, unknown>;
      name = (node["name"] as string) ?? null;
      tier = typeof node["tier"] === "number" ? (node["tier"] as number) : null;
      const ownerNode = node["owner"] as { username?: string } | undefined;
      owner = ownerNode?.username ?? ((node["username"] as string) ?? null);
    }
  } catch (err) {
    console.warn("[radar] identity fetch failed", icao, err instanceof Error ? err.message : err);
  }

  await supabaseAdmin.from("airport_identity_cache").upsert(
    {
      icao,
      name,
      owner_username: owner,
      tier,
      fetched_at: new Date().toISOString(),
      refresh_after: new Date(Date.now() + 7 * 24 * 60 * 60_000).toISOString(),
    },
    { onConflict: "icao" },
  );

  return { icao, name, owner, tier };
}

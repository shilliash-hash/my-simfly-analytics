import { createServerFn } from "@tanstack/react-start";
import {
  awardedPoints, CLASS_RANGES, flightMatchesRoute, haversineNm, monthKey, monthStart, scoreRoute, seededRng,
  type RouteClass,
} from "./dispatch-rules";
import { lookupAircraftSpec } from "./aircraft-specs";
import { parseDispatchSlots, slotsAreFresh, slotWeekStart, type DispatchSlots } from "./dispatch-slots";

export type DispatchRoute = {
  id: string; a: string; b: string; aName: string | null; bName: string | null;
  routeClass: RouteClass; distanceNm: number; basePoints: number; multiplier: number;
  bonuses: string[]; points: number; pilots: string[];
};
export type DispatchBoard = {
  month: string; routes: DispatchRoute[];
  leaderboard: { username: string; points: number; routes: number }[];
  airports: Record<string, DispatchAirport>;
  error?: string;
};
export type DispatchAirport = { icao: string; name: string | null; country: string | null; owner: string | null; tier: number | null; level: number | null; slots?: DispatchSlots | null };

type SlotCacheRow = {
  dispatch_slots_capacity: number | null; dispatch_slots_used: number | null;
  dispatch_airport_active: boolean | null; dispatch_slots_fetched_at: string | null;
};

function cachedSlots(row: SlotCacheRow): DispatchSlots | null {
  const at = row.dispatch_slots_fetched_at;
  if (!at || row.dispatch_slots_capacity === null || row.dispatch_slots_used === null) return null;
  const slots = parseDispatchSlots({ maxRotation: row.dispatch_slots_capacity, rotation: row.dispatch_slots_used,
    active: row.dispatch_airport_active }, new Date(at));
  return slots ? { ...slots, current: slots.weekStart === slotWeekStart() } : null;
}

/** Only public airport presentation data; no pilot identity or scoring changes. */
export const getDispatchAirportSlots = createServerFn({ method: "POST" })
  .inputValidator((input: { icao: string }) => {
    const icao = typeof input?.icao === "string" ? input.icao.trim().toUpperCase() : "";
    if (!/^[A-Z0-9]{4}$/.test(icao)) throw new Error("Invalid airport code");
    return { icao };
  })
  .handler(async ({ data }): Promise<{ slots: DispatchSlots | null; error?: string }> => {
    let fallback: DispatchSlots | null = null;
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      // Restrict enrichment to the current board, rather than a general fetch proxy.
      const { data: route, error: routeError } = await supabaseAdmin.from("dispatch_monthly_routes").select("id")
        .eq("month", monthKey()).or(`airport_a.eq.${data.icao},airport_b.eq.${data.icao}`).limit(1);
      if (routeError || !route?.length) return { slots: null, error: "Airport unavailable on this month's board." };
      const { data: row } = await supabaseAdmin.from("airport_identity_cache")
        .select("dispatch_slots_capacity, dispatch_slots_used, dispatch_airport_active, dispatch_slots_fetched_at")
        .eq("icao", data.icao).maybeSingle();
      fallback = row ? cachedSlots(row) : null;
      if (fallback && slotsAreFresh(fallback.fetchedAt)) return { slots: fallback };
      const res = await fetch(`https://simfly.io/api/user/assets/details/airport/${data.icao}`, {
        headers: { Accept: "application/json" }, signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`Airport details HTTP ${res.status}`);
      const slots = parseDispatchSlots(await res.json());
      if (!slots) throw new Error("Incomplete airport slot data");
      const { error } = await supabaseAdmin.from("airport_identity_cache").upsert({
        icao: data.icao, dispatch_slots_capacity: slots.capacity, dispatch_slots_used: slots.used,
        dispatch_airport_active: slots.active ?? null, dispatch_slots_fetched_at: slots.fetchedAt,
      }, { onConflict: "icao" });
      if (error) console.warn("[dispatch-slots] cache write failed", error.message);
      return { slots };
    } catch (e) {
      console.warn("[dispatch-slots]", e instanceof Error ? e.message : "Lookup failed");
      return { slots: fallback, error: "Live slots temporarily unavailable." };
    }
  });

const PER_CLASS = 24;

async function ensureRoutes(month: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { count } = await supabaseAdmin.from("dispatch_monthly_routes")
    .select("id", { count: "exact", head: true }).eq("month", month);
  if ((count ?? 0) > 0) return;

  const [{ data: airports }, { data: presence }] = await Promise.all([
    supabaseAdmin.from("airport_identity_cache").select("icao, owner_username, level").not("owner_username", "is", null),
    supabaseAdmin.from("pilot_presence").select("username"),
  ]);
  const hub = new Set((presence ?? []).map((p) => p.username.toLowerCase()));
  const { loadGeo } = await import("./simfly.functions");
  const geo = await loadGeo();
  const pool = (airports ?? []).flatMap((r) => {
    const g = geo.get(r.icao.toUpperCase());
    return g ? [{ icao: r.icao.toUpperCase(), lat: g.lat, lon: g.lon, level: r.level,
      hubOwned: hub.has((r.owner_username ?? "").toLowerCase()) }] : [];
  });
  if (pool.length < 2) return;

  const rng = seededRng(`dispatch-${month}`);
  const seen = new Set<string>();
  const rows: Record<string, unknown>[] = [];
  for (const cls of Object.keys(CLASS_RANGES) as RouteClass[]) {
    const { min, max } = CLASS_RANGES[cls];
    let made = 0;
    for (let i = 0; i < 40000 && made < PER_CLASS; i++) {
      const x = pool[Math.floor(rng() * pool.length)], y = pool[Math.floor(rng() * pool.length)];
      if (x.icao === y.icao) continue;
      const [a, b] = x.icao < y.icao ? [x, y] : [y, x];
      const key = `${a.icao}-${b.icao}`;
      if (seen.has(key)) continue;
      const nm = Math.round(haversineNm(a.lat, a.lon, b.lat, b.lon));
      if (nm < min || nm > max) continue;
      seen.add(key); made++;
      const s = scoreRoute(nm, a, b);
      rows.push({ month, airport_a: a.icao, airport_b: b.icao, route_class: cls, distance_nm: nm,
        base_points: s.base, multiplier: s.mult, bonuses: s.bonuses, points: s.points });
    }
  }
  if (rows.length) {
    await supabaseAdmin.from("dispatch_monthly_routes")
      .upsert(rows as never, { onConflict: "month,airport_a,airport_b", ignoreDuplicates: true });
  }
}

async function scanCompletions(month: string, routes: { id: string; airport_a: string; airport_b: string; points: number }[]) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const since = monthStart(month).toISOString();
  const { data: flights } = await supabaseAdmin.from("simfly_flights")
    .select("username, flight_id, aircraft_icao, departure_icao, destination_icao, mission_start_ts")
    .gte("mission_start_ts", since).order("mission_start_ts", { ascending: true }).limit(5000);
  const inserts: Record<string, unknown>[] = [];
  const done = new Set<string>();
  for (const f of flights ?? []) {
    for (const r of routes) {
      if (!flightMatchesRoute(f.departure_icao, f.destination_icao, r.airport_a, r.airport_b)) continue;
      const k = `${r.id}|${f.username.toLowerCase()}`;
      if (done.has(k)) continue; // once per pilot per month, earliest flight
      done.add(k);
      inserts.push({ route_id: r.id, month, pilot_username: f.username, flight_id: f.flight_id,
        completed_at: f.mission_start_ts, awarded_points: awardedPoints(r.points, lookupAircraftSpec(f.aircraft_icao).spec.category) });
    }
  }
  if (inserts.length) {
    await supabaseAdmin.from("dispatch_completions")
      .upsert(inserts as never, { onConflict: "route_id,pilot_username", ignoreDuplicates: true });
  }
}

/** Public: this month's Dispatch board (routes are generated once per month, completions auto-verified). */
export const getDispatchBoard = createServerFn({ method: "GET" }).handler(async (): Promise<DispatchBoard> => {
  const month = monthKey();
  try {
    await ensureRoutes(month);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: routes } = await supabaseAdmin.from("dispatch_monthly_routes").select("*").eq("month", month);
    await scanCompletions(month, routes ?? []);
    const [{ data: comps }, { data: names }] = await Promise.all([
      supabaseAdmin.from("dispatch_completions").select("route_id, pilot_username, awarded_points").eq("month", month),
      supabaseAdmin.from("airport_identity_cache").select("icao, name, country, owner_username, tier, level, dispatch_slots_capacity, dispatch_slots_used, dispatch_airport_active, dispatch_slots_fetched_at")
        .in("icao", [...new Set((routes ?? []).flatMap((r) => [r.airport_a, r.airport_b]))]),
    ]);
    const icaoList = [...new Set((routes ?? []).flatMap((r) => [r.airport_a, r.airport_b]))];
    const { data: util } = await supabaseAdmin.from("airport_utilization_week").select("icao, week_start_utc, capacity, used")
      .in("icao", icaoList).order("week_start_utc", { ascending: false }).limit(5000);
    const now = new Date(); const dow = (now.getUTCDay() + 6) % 7;
    const curWeek = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - dow);
    const slotOf = new Map<string, NonNullable<DispatchAirport["slots"]>>();
    for (const u of util ?? []) {
      const k = u.icao.toUpperCase(); if (slotOf.has(k)) continue;
      slotOf.set(k, { capacity: u.capacity, used: u.used, free: Math.max(0, u.capacity - u.used), weekStart: u.week_start_utc, current: Date.parse(u.week_start_utc) >= curWeek });
    }
    const nameOf = new Map((names ?? []).map((n) => [n.icao.toUpperCase(), n.name]));
    const byRoute = new Map<string, string[]>();
    const lb = new Map<string, { username: string; points: number; routes: number }>();
    for (const c of comps ?? []) {
      byRoute.set(c.route_id, [...(byRoute.get(c.route_id) ?? []), c.pilot_username]);
      const e = lb.get(c.pilot_username) ?? { username: c.pilot_username, points: 0, routes: 0 };
      e.points += c.awarded_points; e.routes++; lb.set(c.pilot_username, e);
    }
    const airports: Record<string, DispatchAirport> = {};
    for (const n of names ?? []) airports[n.icao.toUpperCase()] = { icao: n.icao.toUpperCase(), name: n.name, country: n.country, owner: n.owner_username, tier: n.tier, level: n.level, slots: cachedSlots(n) ?? slotOf.get(n.icao.toUpperCase()) ?? null };
    return {
      month, airports,
      routes: (routes ?? []).map((r) => ({
        id: r.id, a: r.airport_a, b: r.airport_b, aName: nameOf.get(r.airport_a) ?? null, bName: nameOf.get(r.airport_b) ?? null,
        routeClass: r.route_class as RouteClass, distanceNm: r.distance_nm, basePoints: r.base_points,
        multiplier: Number(r.multiplier), bonuses: r.bonuses, points: r.points, pilots: byRoute.get(r.id) ?? [],
      })).sort((x, y) => y.points - x.points),
      leaderboard: [...lb.values()].sort((a, b) => b.points - a.points),
    };
  } catch (e) {
    console.error("[dispatch]", e);
    return { month, routes: [], leaderboard: [], airports: {}, error: "Dispatch board is temporarily unavailable." };
  }
});

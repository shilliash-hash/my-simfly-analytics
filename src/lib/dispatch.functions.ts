import { createServerFn } from "@tanstack/react-start";
import {
  CLASS_RANGES, flightMatchesRoute, haversineNm, monthKey, monthStart, scoreRoute, seededRng,
  type RouteClass,
} from "./dispatch-rules";

export type DispatchRoute = {
  id: string; a: string; b: string; aName: string | null; bName: string | null;
  routeClass: RouteClass; distanceNm: number; basePoints: number; multiplier: number;
  bonuses: string[]; points: number; pilots: string[];
};
export type DispatchBoard = {
  month: string; routes: DispatchRoute[];
  leaderboard: { username: string; points: number; routes: number }[];
  error?: string;
};

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
    .select("username, flight_id, departure_icao, destination_icao, mission_start_ts")
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
        completed_at: f.mission_start_ts, awarded_points: r.points });
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
      supabaseAdmin.from("airport_identity_cache").select("icao, name")
        .in("icao", [...new Set((routes ?? []).flatMap((r) => [r.airport_a, r.airport_b]))]),
    ]);
    const nameOf = new Map((names ?? []).map((n) => [n.icao.toUpperCase(), n.name]));
    const byRoute = new Map<string, string[]>();
    const lb = new Map<string, { username: string; points: number; routes: number }>();
    for (const c of comps ?? []) {
      byRoute.set(c.route_id, [...(byRoute.get(c.route_id) ?? []), c.pilot_username]);
      const e = lb.get(c.pilot_username) ?? { username: c.pilot_username, points: 0, routes: 0 };
      e.points += c.awarded_points; e.routes++; lb.set(c.pilot_username, e);
    }
    return {
      month,
      routes: (routes ?? []).map((r) => ({
        id: r.id, a: r.airport_a, b: r.airport_b, aName: nameOf.get(r.airport_a) ?? null, bName: nameOf.get(r.airport_b) ?? null,
        routeClass: r.route_class as RouteClass, distanceNm: r.distance_nm, basePoints: r.base_points,
        multiplier: Number(r.multiplier), bonuses: r.bonuses, points: r.points, pilots: byRoute.get(r.id) ?? [],
      })).sort((x, y) => y.points - x.points),
      leaderboard: [...lb.values()].sort((a, b) => b.points - a.points),
    };
  } catch (e) {
    console.error("[dispatch]", e);
    return { month, routes: [], leaderboard: [], error: "Dispatch board is temporarily unavailable." };
  }
});

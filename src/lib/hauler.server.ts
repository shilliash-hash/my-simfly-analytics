import { nominalCapacity, missingLogOutcome, nextLogCursor, routeKind, verificationAirport, type LogOutcome } from "./hauler-rules";
import { isSystemAirport } from "./hauler-system.server";
type Product = { slug: string; icao: string; name: string; category: number; attributes?: { passengers?: number; range?: number } };
type Airport = { icao: string; name: string; active?: boolean; category: number; level: number; owner?: { username?: string } };
type Live = { id: string; username: string; originICAO: string; destinationICAO: string; aircraftICAO: string; slug: string; startTime: string };
type Arrival = { flightID: string; status: string; departureTime: string; landingTime?: string; totalDistance?: number; pilot?: { username?: string }; origin?: { icao?: string }; destination?: { icao?: string } };
async function json<T>(path: string): Promise<T> {
  const res = await fetch(`https://simfly.io/api/${path}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error("SimFly data unavailable");
  return await res.json() as T;
}
function check(error: { message: string } | null) { if (error) throw new Error(error.message); }
/** SimFly airport codes: 2–5 letters/digits (US fields such as 06A, C83 included). */
const CODE = /^[A-Z0-9]{2,5}$/;

/** Maintenance only: trusted SimFly inputs, never user-supplied flight claims. */
export async function sweepHauler() {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: gate, error: gateError } = await db.from("hauler_worker_state").select("last_started_at").eq("key", "network").maybeSingle();
  check(gateError);
  if (gate && Date.now() - new Date(gate.last_started_at).getTime() < 45_000) return { observed: 0, settled: 0, skipped: true };
  const { data: acquired, error: lockError } = await db.rpc("hauler_acquire_sweep");
  check(lockError);
  if (!acquired) return { observed: 0, settled: 0, skipped: true };
  let observed = 0, settled = 0;
  try {
    const live = await json<{ data?: Live[] }>("flights");
    if (!Array.isArray(live.data)) throw new Error("Invalid live feed");
    const { data: presence, error: pe } = await db.from("pilot_presence").select("username"); check(pe);
    const members = new Set((presence ?? []).map(p => p.username.toLowerCase()));
    const { data: registered, error: ae } = await db.from("hauler_airport_state").select("icao"); check(ae);
    const network = new Set((registered ?? []).map(a => a.icao));
    const eligible = live.data.filter(f => members.has(f.username.toLowerCase()) && f.originICAO !== f.destinationICAO);
    const { data: seen, error: se } = await db.from("hauler_flight_ledger").select("flight_id").in("flight_id", eligible.map(f => f.id)); check(se);
    const ids = new Set((seen ?? []).map(f => f.flight_id));
    for (const f of eligible.filter(f => !ids.has(f.id)).slice(0, 12)) {
      try {
        if (![f.originICAO,f.destinationICAO].every(c => CODE.test(c))) continue;
        // SimFly-owned (system) endpoints come from SimFly's public catalogue; they hold no passenger pool.
        const system = { [f.originICAO]: await isSystemAirport(f.originICAO) === true, [f.destinationICAO]: await isSystemAirport(f.destinationICAO) === true };
        const kind = routeKind(system[f.originICAO], system[f.destinationICAO]);
        if (kind === "ineligible") continue;
        // Verify active player ownership from the public detail endpoint, without touching identity caches.
        for (const icao of [f.originICAO, f.destinationICAO].filter(c => !system[c])) {
          const a = await json<Airport>(`user/assets/details/airport/${icao}`);
          if (!a.active || !a.owner?.username || a.category < 1 || a.category > 7) { network.delete(icao); continue; }
          const capacity = nominalCapacity(a.category,a.level);
          if (!network.has(icao)) {
            const { error } = await db.from("hauler_airport_state").upsert({ icao, name:a.name, owner_username:a.owner.username, tier:a.category, level:a.level, capacity, current_pax:capacity*.1, active:true },{onConflict:"icao",ignoreDuplicates:true}); check(error); network.add(icao);
          } else {
            const { error } = await db.from("hauler_airport_state").update({ name:a.name,owner_username:a.owner.username,tier:a.category,level:a.level,capacity,active:true }).eq("icao",icao); check(error);
          }
        }
        if ((!system[f.originICAO] && !network.has(f.originICAO)) || (!system[f.destinationICAO] && !network.has(f.destinationICAO))) continue;
        if (!/^[a-z0-9-]+$/i.test(f.slug)) continue;
        const p = await json<Product>(`products/airplanes/details/${encodeURIComponent(f.slug)}`);
        const seats = p.attributes?.passengers;
        if (!Number.isInteger(seats) || !seats || seats < 1 || p.category < 1 || p.category > 7) continue;
        const { error: ce } = await db.from("hauler_catalogue").upsert({slug:p.slug,icao:p.icao,name:p.name,tier:p.category,seats,range_nm:p.attributes?.range ?? null,fetched_at:new Date().toISOString()});check(ce);
        const base = {_flight_id:f.id,_pilot:f.username,_origin:f.originICAO,_destination:f.destinationICAO,_aircraft:f.aircraftICAO,_tier:p.category,_seats:seats,_departure:f.startTime};
        const { error } = kind === "network"
          ? await db.rpc("hauler_observe_flight", base)
          : await db.rpc("hauler_observe_system_flight", { ...base, _origin_system: system[f.originICAO], _destination_system: system[f.destinationICAO] });
        check(error); observed++;
      } catch (error) { console.warn("[hauler] observation unavailable", error instanceof Error ? error.message : "unknown"); }
    }
    const { data: pending, error: pendingError } = await db.from("hauler_flight_ledger").select("flight_id,pilot_username,origin_icao,destination_icao,departure_at,destination_system").eq("status","airborne").order("departure_at").limit(50); check(pendingError);
    const inAir = new Set(live.data.map(f => f.id));
    for (const f of (pending ?? []).filter(f => !inAir.has(f.flight_id))) {
      try {
        // Disappearance is NOT proof of completion. Require exact official Success + pilot + endpoints.
        // System airports publish no log, so hybrid flights are checked in their player airport's log.
        const logIcao = verificationAirport(f.origin_icao, f.destination_icao, f.destination_system);
        let match: Arrival | undefined;
        for (let page=1; page<=10 && !match; page++) {
          const log = await json<{flights?:Arrival[]}>(`user/assets/airport/${logIcao}/flights?page=${page}`);
          if (!log.flights?.length) break;
          match=log.flights.find(a => a.flightID===f.flight_id);
          if (log.flights.every(a => new Date(a.departureTime).getTime()<new Date(f.departure_at).getTime())) break;
        }
        if (match?.status !== "Success" || !match.landingTime || match.pilot?.username?.toLowerCase()!==f.pilot_username || match.origin?.icao!==f.origin_icao || match.destination?.icao!==f.destination_icao || !match.totalDistance) continue;
        const {error}=await db.rpc("hauler_settle_flight",{_flight_id:f.flight_id,_pilot:match.pilot.username,_origin:f.origin_icao,_destination:f.destination_icao,_distance:match.totalDistance,_landed:match.landingTime});check(error);settled++;
      } catch (error) { console.warn("[hauler] settlement pending", error instanceof Error ? error.message : "unknown"); }
    }
    const {error}=await db.from("hauler_worker_state").update({last_completed_at:new Date().toISOString(),error:null}).eq("key","network");check(error);
    return {observed,settled,skipped:false};
  } catch (error) {
    await db.from("hauler_worker_state").update({error:"SimFly check unavailable; payouts remain pending."}).eq("key","network");
    throw error;
  }
}

/** Populate exact marketplace specs, not the Hub's approximate ETA categories. */
export async function syncHaulerCatalogue() {
  const {supabaseAdmin:db}=await import("@/integrations/supabase/client.server");
  const {data:cached,error}=await db.from("hauler_catalogue").select("slug,fetched_at");check(error);
  const fresh=new Set((cached??[]).filter(p=>Date.now()-new Date(p.fetched_at).getTime()<86400000).map(p=>p.slug));
  let added=0;
  for(let page=1;page<=9;page++) {
    const list=await json<{items?:Product[];total?:number}>(`products/airplanes/filters?page=${page}`);
    if(!list.items?.length) break;
    const missing=list.items.filter(p=>!fresh.has(p.slug));
    for(let i=0;i<missing.length;i+=5) await Promise.all(missing.slice(i,i+5).map(async item=>{
      const p=await json<Product>(`products/airplanes/details/${encodeURIComponent(item.slug)}`);
      const seats=p.attributes?.passengers;
      if(!seats || p.category<1 || p.category>7) return;
      const {error}=await db.from("hauler_catalogue").upsert({slug:p.slug,icao:p.icao,name:p.name,tier:p.category,seats,range_nm:p.attributes?.range??null,fetched_at:new Date().toISOString()});check(error);added++;
    }));
    if(page*9>=(list.total??0)) break;
  }
  return added;
}

export async function verifyHaulerAirports() {
  const {supabaseAdmin:db}=await import("@/integrations/supabase/client.server");
  const {data:rows,error}=await db.from("hauler_airport_state").select("icao");check(error);
  let verified=0;
  for(let i=0;i<(rows??[]).length;i+=12) await Promise.all((rows??[]).slice(i,i+12).map(async row=>{
    try {
      const a=await json<Airport>(`user/assets/details/airport/${row.icao}`);
      const active=a.active===true&&!!a.owner?.username&&a.category>=1&&a.category<=7;
      const {error}=await db.from("hauler_airport_state").update(active?{active:true,name:a.name,owner_username:a.owner?.username,tier:a.category,level:a.level,capacity:nominalCapacity(a.category,a.level)}:{active:false}).eq("icao",row.icao);check(error);if(active)verified++;
    } catch { /* Leave unverified airports hidden until a successful retry. */ }
  }));
  return verified;
}
type LogbookEntry = { id?: string; aircraft_icao?: string; aircraft_slug?: string; departure_icao?: string; destination_icao?: string; mission_start_ts?: string };
type Candidate = { id: string; pilot: string; origin: string; destination: string; originSystem: boolean; destinationSystem: boolean; aircraft: string; slug: string; startedAt: number; outcome: LogOutcome; arrival?: Arrival };


async function pilotNonce(db: Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"], username: string, cached?: string) {
  if (cached && /^\d+$/.test(cached)) return cached;
  for (const period of ["all", "month", "week", "day"]) {
    const r = await json<{ content?: { ranks?: { username?: string; usernonce?: number }[] } }>(`game/sky-rank?period=${period}&res=16&uname=${encodeURIComponent(username)}`).catch(() => null);
    const n = r?.content?.ranks?.find(x => x.username === username)?.usernonce;
    if (typeof n === "number" && Number.isFinite(n) && n > 0) {
      await db.from("pilot_nonces").upsert({ username, nonce: String(n), resolved_at: new Date().toISOString() }, { onConflict: "username" });
      return String(n);
    }
  }
  return null;
}

async function pool<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) await Promise.all(items.slice(i, i + size).map(fn));
}

/**
 * Maintenance only, at most once per hour (DB-gated): recover Hub pilots' flights that the live sweep
 * missed while airborne. Every credit still requires an exact official Success arrival record.
 */
export async function sweepHaulerLogs() {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: acquired, error: lockError } = await db.rpc("hauler_acquire_retro_sweep");
  check(lockError);
  if (!acquired) return { pilots: 0, recovered: 0, pending: 0, skipped: true };
  try {
    const [presence, airports, catalogue] = await Promise.all([
      db.from("pilot_presence").select("username").order("last_seen_at", { ascending: false }).limit(60),
      db.from("hauler_airport_state").select("icao,created_at").eq("active", true).limit(5000),
      db.from("hauler_catalogue").select("slug,tier,seats"),
    ]);
    check(presence.error); check(airports.error); check(catalogue.error);
    const pilots = (presence.data ?? []).map(p => p.username).filter(Boolean);
    const network = new Map((airports.data ?? []).map(a => [a.icao, new Date(a.created_at).getTime()]));
    const specs = new Map((catalogue.data ?? []).map(p => [p.slug, p]));
    if (!pilots.length || !network.size) {
      check((await db.from("hauler_worker_state").update({ last_completed_at: new Date().toISOString(), error: null }).eq("key", "retro")).error);
      return { pilots: 0, recovered: 0, pending: 0, skipped: false };
    }
    const networkStart = Math.min(...network.values());
    const floor = Math.max(networkStart, Date.now() - 14 * 86400_000);
    const [cursors, nonces] = await Promise.all([
      db.from("hauler_retro_cursor").select("username,scanned_until").in("username", pilots),
      db.from("pilot_nonces").select("username,nonce").in("username", pilots),
    ]);
    check(cursors.error); check(nonces.error);
    const since = new Map((cursors.data ?? []).map(c => [c.username, Math.max(floor, new Date(c.scanned_until).getTime())]));
    const nonceOf = new Map((nonces.data ?? []).map(n => [n.username, n.nonce]));

    // 1) Read each Hub pilot's public logbook back to their cursor.
    const byPilot = new Map<string, { since: number; seen: number[]; candidates: Candidate[]; scanned: boolean }>();
    await pool(pilots, 5, async pilot => {
      const from = since.get(pilot) ?? floor;
      const state = { since: from, seen: [] as number[], candidates: [] as Candidate[], scanned: false };
      byPilot.set(pilot, state);
      try {
        const nonce = await pilotNonce(db, pilot, nonceOf.get(pilot));
        if (!nonce) return;
        for (let page = 1; page <= 5; page++) {
          const log = await json<{ flights?: LogbookEntry[] }>(`user/flights?username=${encodeURIComponent(pilot)}&nonce=${nonce}&fpage=${page}`);
          const rows = log.flights ?? [];
          let older = !rows.length;
          for (const f of rows) {
            const at = new Date(f.mission_start_ts ?? "").getTime();
            if (!Number.isFinite(at) || at <= from) { older = true; continue; }
            state.seen.push(at);
            const o = f.departure_icao ?? "", d = f.destination_icao ?? "", slug = f.aircraft_slug ?? "";
            if (!f.id || !CODE.test(o) || !CODE.test(d) || o === d || !/^[a-z0-9-]+$/i.test(slug)) continue;
            // Each endpoint is a Hauler player airport or a SimFly system airport; at least one must be a player airport.
            const oSys = !network.has(o) && await isSystemAirport(o) === true, dSys = !network.has(d) && await isSystemAirport(d) === true;
            if ((!oSys && !network.has(o)) || (!dSys && !network.has(d)) || routeKind(oSys, dSys) === "ineligible") continue;
            if (at < Math.max(oSys ? 0 : network.get(o)!, dSys ? 0 : network.get(d)!) - 3600_000) continue;
            state.candidates.push({ id: f.id, pilot, origin: o, destination: d, originSystem: oSys, destinationSystem: dSys, aircraft: f.aircraft_icao ?? "", slug, startedAt: at, outcome: "pending" });
          }
          if (older) break;
        }
        state.scanned = true;
      } catch (error) { console.warn("[hauler] logbook unavailable", pilot, error instanceof Error ? error.message : "unknown"); }
    });
    const all = [...byPilot.values()].flatMap(s => s.candidates);

    // 2) Skip flights the live sweep already holds (airborne or settled).
    if (all.length) {
      const { data: known, error } = await db.from("hauler_flight_ledger").select("flight_id").in("flight_id", all.map(c => c.id)); check(error);
      const ids = new Set((known ?? []).map(k => k.flight_id));
      for (const c of all) if (ids.has(c.id)) c.outcome = "exists";
    }
    const todo = all.filter(c => c.outcome === "pending").sort((a, b) => a.startedAt - b.startedAt).slice(0, 30);

    // 3) Verify against each player airport's official log (arrival side, or departure side for flights to a system airport), sharing pages per airport.
    const byDestination = new Map<string, Candidate[]>();
    for (const c of todo) { const k = verificationAirport(c.origin, c.destination, c.destinationSystem); byDestination.set(k, [...(byDestination.get(k) ?? []), c]); }
    await pool([...byDestination.entries()], 4, async ([icao, list]) => {
      const wanted = new Map(list.map(c => [c.id, c]));
      const oldest = Math.min(...list.map(c => c.startedAt)) - 2 * 3600_000;
      try {
        for (let page = 1; page <= 10 && wanted.size; page++) {
          const log = await json<{ flights?: Arrival[] }>(`user/assets/airport/${icao}/flights?page=${page}`);
          const rows = log.flights ?? [];
          for (const a of rows) { const c = wanted.get(a.flightID); if (c) { c.arrival = a; wanted.delete(a.flightID); } }
          if (!rows.length || rows.every(a => new Date(a.landingTime ?? a.departureTime).getTime() < oldest)) break;
        }
        for (const c of wanted.values()) c.outcome = missingLogOutcome(c.startedAt, Date.now());
      } catch (error) { console.warn("[hauler] arrival log unavailable", icao, error instanceof Error ? error.message : "unknown"); }
    });

    // 4) Record in chronological order so passenger stocks flow in the order flights happened.
    let recovered = 0;
    for (const c of todo.filter(c => c.arrival)) {
      const a = c.arrival!;
      try {
        if (a.status !== "Success" || !a.landingTime || !a.totalDistance || a.pilot?.username?.toLowerCase() !== c.pilot.toLowerCase() || a.origin?.icao !== c.origin || a.destination?.icao !== c.destination) { c.outcome = "rejected"; continue; }
        let p = specs.get(c.slug);
        if (!p) {
          const d = await json<Product>(`products/airplanes/details/${encodeURIComponent(c.slug)}`);
          const seats = d.attributes?.passengers;
          if (!Number.isInteger(seats) || !seats || seats < 1 || d.category < 1 || d.category > 7) { c.outcome = "rejected"; continue; }
          check((await db.from("hauler_catalogue").upsert({ slug: d.slug, icao: d.icao, name: d.name, tier: d.category, seats, range_nm: d.attributes?.range ?? null, fetched_at: new Date().toISOString() })).error);
          p = { slug: d.slug, tier: d.category, seats }; specs.set(c.slug, p);
        }
        const args = { _flight_id: c.id, _pilot: a.pilot.username, _origin: c.origin, _destination: c.destination, _aircraft: c.aircraft || "UNKN", _tier: p.tier, _seats: p.seats, _departure: a.departureTime, _distance: a.totalDistance, _landed: a.landingTime };
        const { data, error } = routeKind(c.originSystem, c.destinationSystem) === "network"
          ? await db.rpc("hauler_record_logged_flight", args)
          : await db.rpc("hauler_record_system_flight", { ...args, _origin_system: c.originSystem, _destination_system: c.destinationSystem });
        check(error);
        c.outcome = data === "recorded" ? "recorded" : data === "exists" ? "exists" : "rejected";
        if (data === "recorded") recovered++;
      } catch (error) { c.outcome = "pending"; console.warn("[hauler] log recovery pending", error instanceof Error ? error.message : "unknown"); }
    }

    // 5) Advance cursors only past handled flights; capped-out candidates stay pending for the next run.
    const now = new Date().toISOString();
    const rows = [...byPilot.entries()].filter(([, s]) => s.scanned).map(([username, s]) => {
      const outcomes = new Map(s.candidates.map(c => [c.startedAt, c.outcome]));
      const entries = s.seen.map(startedAt => ({ startedAt, outcome: (outcomes.get(startedAt) ?? "rejected") as LogOutcome }));
      return { username, scanned_until: new Date(nextLogCursor(s.since, entries)).toISOString(), scanned_at: now };
    });
    if (rows.length) check((await db.from("hauler_retro_cursor").upsert(rows, { onConflict: "username" })).error);
    check((await db.from("hauler_worker_state").update({ last_completed_at: now, error: null }).eq("key", "retro")).error);
    return { pilots: rows.length, recovered, pending: all.filter(c => c.outcome === "pending").length, skipped: false };
  } catch (error) {
    await db.from("hauler_worker_state").update({ error: "Flight log recovery unavailable; retrying shortly.", last_started_at: new Date(Date.now() - 50 * 60_000).toISOString() }).eq("key", "retro");
    throw error;
  }
}

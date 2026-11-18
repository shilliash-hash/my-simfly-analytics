import { nominalCapacity } from "./hauler-rules";
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
        if (![f.originICAO,f.destinationICAO].every(c => /^[A-Z0-9]{4}$/.test(c))) continue;
        // Verify active player ownership from the public detail endpoint, without touching identity caches.
        for (const icao of [f.originICAO, f.destinationICAO]) {
          const a = await json<Airport>(`user/assets/details/airport/${icao}`);
          if (!a.active || !a.owner?.username || a.category < 1 || a.category > 7) { network.delete(icao); continue; }
          const capacity = nominalCapacity(a.category,a.level);
          if (!network.has(icao)) {
            const { error } = await db.from("hauler_airport_state").upsert({ icao, name:a.name, owner_username:a.owner.username, tier:a.category, level:a.level, capacity, current_pax:capacity*.1, active:true },{onConflict:"icao",ignoreDuplicates:true}); check(error); network.add(icao);
          } else {
            const { error } = await db.from("hauler_airport_state").update({ name:a.name,owner_username:a.owner.username,tier:a.category,level:a.level,capacity,active:true }).eq("icao",icao); check(error);
          }
        }
        if (!network.has(f.originICAO) || !network.has(f.destinationICAO)) continue;
        if (!/^[a-z0-9-]+$/i.test(f.slug)) continue;
        const p = await json<Product>(`products/airplanes/details/${encodeURIComponent(f.slug)}`);
        const seats = p.attributes?.passengers;
        if (!Number.isInteger(seats) || !seats || seats < 1 || p.category < 1 || p.category > 7) continue;
        const { error: ce } = await db.from("hauler_catalogue").upsert({slug:p.slug,icao:p.icao,name:p.name,tier:p.category,seats,range_nm:p.attributes?.range ?? null,fetched_at:new Date().toISOString()});check(ce);
        const { error } = await db.rpc("hauler_observe_flight",{_flight_id:f.id,_pilot:f.username,_origin:f.originICAO,_destination:f.destinationICAO,_aircraft:f.aircraftICAO,_tier:p.category,_seats:seats,_departure:f.startTime}); check(error); observed++;
      } catch (error) { console.warn("[hauler] observation unavailable", error instanceof Error ? error.message : "unknown"); }
    }
    const { data: pending, error: pendingError } = await db.from("hauler_flight_ledger").select("flight_id,pilot_username,origin_icao,destination_icao,departure_at").eq("status","airborne").order("departure_at").limit(50); check(pendingError);
    const inAir = new Set(live.data.map(f => f.id));
    for (const f of (pending ?? []).filter(f => !inAir.has(f.flight_id))) {
      try {
        // Disappearance is NOT proof of completion. Require exact official Success + pilot + endpoints.
        let match: Arrival | undefined;
        for (let page=1; page<=10 && !match; page++) {
          const log = await json<{flights?:Arrival[]}>(`user/assets/airport/${f.destination_icao}/flights?page=${page}`);
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

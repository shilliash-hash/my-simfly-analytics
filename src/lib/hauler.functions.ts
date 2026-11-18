import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { projectedStock } from "./hauler-rules";
export const getHaulerBoard = createServerFn({method:"GET"}).handler(async()=>{
  const key=process.env['SUPABASE_PUBLISHABLE_KEY']||process.env['VITE_SUPABASE_PUBLISHABLE_KEY']||process.env['SUPABASE_ANON_KEY']||process.env['VITE_SUPABASE_ANON_KEY'];
  const url=process.env['SUPABASE_URL']||process.env['VITE_SUPABASE_URL'];
  if(!key || !url){console.error("[hauler] missing env",{hasUrl:!!url,hasKey:!!key});throw new Error("Hauler temporarily unavailable");}
  const db=createClient<Database>(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>{
    const headers=new Headers(init?.headers); if(key.startsWith("sb_") && headers.get("Authorization")===`Bearer ${key}`) headers.delete("Authorization"); headers.set("apikey",key);return fetch(input,{...init,headers});
  }}});
  const [airports,aircraft,flights,worker,logWorker]=await Promise.all([
    db.from("hauler_airport_state").select("*").eq("active",true).order("icao").limit(5000),
    db.from("hauler_catalogue").select("slug,icao,name,tier,seats,range_nm").order("tier").order("name"),
    db.from("hauler_flight_ledger").select("*").order("observed_at",{ascending:false}).limit(5000),
    db.from("hauler_worker_state").select("last_completed_at,error").eq("key","network").maybeSingle(),
    db.from("hauler_worker_state").select("last_completed_at,error").eq("key","retro").maybeSingle(),
  ]);
  if(airports.error || aircraft.error || flights.error || worker.error){console.error("[hauler] board query failed",{airports:airports.error,aircraft:aircraft.error,flights:flights.error,worker:worker.error});throw new Error("Hauler data temporarily unavailable");}
  return {airports:(airports.data??[]).map(a=>({...a,current_pax:projectedStock(a.current_pax,a.capacity,new Date(a.regenerated_at).getTime(),Date.now(),new Date(a.last_departure_at??a.created_at).getTime())})),aircraft:aircraft.data??[],flights:flights.data??[],worker:worker.data,logWorker:logWorker.error?null:logWorker.data};
});
export const getHaulerDistance=createServerFn({method:"POST"}).inputValidator((d:{origin:string;destination:string})=>{
  if(!/^[A-Z0-9]{2,5}$/.test(d.origin)||!/^[A-Z0-9]{2,5}$/.test(d.destination)||d.origin===d.destination) throw new Error("Choose two different airports");return d;
}).handler(async({data})=>{
  const {haversineNm}=await import("./dispatch-rules");
  try {
    const {systemCatalogue}=await import("./hauler-system.server");
    const {byIcao}=await systemCatalogue();const a=byIcao.get(data.origin),b=byIcao.get(data.destination);
    if(a&&b) return {distanceNm:Math.round(haversineNm(a.lat,a.lng,b.lat,b.lng))};
  } catch { /* fall back to OpenFlights below */ }
  const {loadGeo}=await import("./simfly.functions");
  const geo=await loadGeo();const a=geo.get(data.origin),b=geo.get(data.destination);
  if(!a || !b) return {distanceNm:null};
  return {distanceNm:Math.round(haversineNm(a.lat,a.lon,b.lat,b.lon))};
});
/** Public prefix search over SimFly's airport catalogue for the planner (display only). */
export const searchHaulerAirports=createServerFn({method:"POST"}).inputValidator((d:{q:string})=>{
  const q=String(d.q??"").trim().toUpperCase().slice(0,40);if(!q) throw new Error("Empty search");return {q};
}).handler(async({data})=>{
  const {systemCatalogue}=await import("./hauler-system.server");
  const {list}=await systemCatalogue();const q=data.q;
  const byCode=list.filter(a=>a.icao.startsWith(q));
  const byName=q.length>=3?list.filter(a=>!a.icao.startsWith(q)&&a.name.toUpperCase().includes(q)):[];
  return [...byCode.sort((a,b)=>a.icao.length-b.icao.length||a.icao.localeCompare(b.icao)),...byName].slice(0,20).map(({icao,name,tier,country,owner})=>({icao,name,tier,country,system:!owner,owner:owner??null}));
});
/** Public on-demand flight check. Safe to expose: both sweeps read only official SimFly data; the live check is throttled to one run per 45 s and the log recovery to one run per hour, each serialized by the database. */
export const syncHaulerFlights=createServerFn({method:"POST"}).handler(async()=>{
  const {sweepHauler,sweepHaulerLogs}=await import("./hauler.server");
  let ok=true,observed=0,settled=0,skipped=false,recovered=0,logChecked=false;
  try {const r=await sweepHauler();observed=r.observed;settled=r.settled;skipped=!!r.skipped;}
  catch(error){ok=false;console.error("[hauler] on-demand check failed",error instanceof Error?error.message:error);}
  try {const r=await sweepHaulerLogs();recovered=r.recovered;logChecked=!r.skipped;}
  catch(error){console.error("[hauler] log recovery failed",error instanceof Error?error.message:error);}
  return {ok,observed,settled,skipped,recovered,logChecked};
});

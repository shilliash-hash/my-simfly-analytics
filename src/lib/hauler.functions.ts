import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { regeneratedStock } from "./hauler-rules";
export const getHaulerBoard = createServerFn({method:"GET"}).handler(async()=>{
  const key=process.env['SUPABASE_PUBLISHABLE_KEY'];
  const url=process.env['SUPABASE_URL'];
  if(!key || !url) throw new Error("Hauler temporarily unavailable");
  const db=createClient<Database>(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>{
    const headers=new Headers(init?.headers); if(key.startsWith("sb_") && headers.get("Authorization")===`Bearer ${key}`) headers.delete("Authorization"); headers.set("apikey",key);return fetch(input,{...init,headers});
  }}});
  const [airports,aircraft,flights,worker]=await Promise.all([
    db.from("hauler_airport_state").select("*").eq("active",true).order("icao").limit(5000),
    db.from("hauler_catalogue").select("slug,icao,name,tier,seats,range_nm").order("tier").order("name"),
    db.from("hauler_flight_ledger").select("*").order("observed_at",{ascending:false}).limit(5000),
    db.from("hauler_worker_state").select("last_completed_at,error").eq("key","network").maybeSingle(),
  ]);
  if(airports.error || aircraft.error || flights.error || worker.error) throw new Error("Hauler data temporarily unavailable");
  return {airports:(airports.data??[]).map(a=>({...a,current_pax:regeneratedStock(a.current_pax,a.capacity,(Date.now()-new Date(a.regenerated_at).getTime())/3600000)})),aircraft:aircraft.data??[],flights:flights.data??[],worker:worker.data};
});
export const getHaulerDistance=createServerFn({method:"POST"}).inputValidator((d:{origin:string;destination:string})=>{
  if(!/^[A-Z0-9]{4}$/.test(d.origin)||!/^[A-Z0-9]{4}$/.test(d.destination)||d.origin===d.destination) throw new Error("Choose two different airports");return d;
}).handler(async({data})=>{
  const {loadGeo}=await import("./simfly.functions");
  const {haversineNm}=await import("./dispatch-rules");
  const geo=await loadGeo();const a=geo.get(data.origin),b=geo.get(data.destination);
  if(!a || !b) return {distanceNm:null};
  return {distanceNm:Math.round(haversineNm(a.lat,a.lon,b.lat,b.lon))};
});

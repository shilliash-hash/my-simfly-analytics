import { createFileRoute } from "@tanstack/react-router";
export const Route=createFileRoute("/api/hauler-check")({server:{handlers:{POST:async({request})=>{
  // Temporary admin maintenance only until managed scheduling is available.
  const expected=process.env['ADMIN_TOKEN'];
  const token=request.headers.get("authorization")?.replace(/^Bearer /,"");
  if(!expected||!token) return new Response("Unauthorized",{status:401});
  const {createHash,timingSafeEqual}=await import("node:crypto");
  const digest=(s:string)=>createHash("sha256").update(s).digest();
  if(!timingSafeEqual(digest(expected),digest(token))) return new Response("Unauthorized",{status:401});
  try {const {sweepHauler,syncHaulerCatalogue,verifyHaulerAirports}=await import("@/lib/hauler.server");
    const catalogue=request.headers.get("x-hauler-catalogue")==="sync"?await syncHaulerCatalogue():0;
    const airports=request.headers.get("x-hauler-airports")==="sync"?await verifyHaulerAirports():0;
    return Response.json({catalogue,airports,...await sweepHauler()});
  } catch(error){console.error("[hauler] maintenance failed",error);return Response.json({error:"Hauler check unavailable"},{status:503});}
}}}});

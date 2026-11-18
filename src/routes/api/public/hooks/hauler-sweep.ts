import { createFileRoute } from "@tanstack/react-router";
export const Route=createFileRoute("/api/public/hooks/hauler-sweep")({server:{handlers:{POST:async({request})=>{
  const {authenticateCronRequest}=await import("@/integrations/supabase/cron-auth");
  const denied=await authenticateCronRequest(request);if(denied)return denied;
  try {const {sweepHauler}=await import("@/lib/hauler.server");return Response.json(await sweepHauler());}
  catch(error){console.error("[hauler] scheduled check failed",error);return Response.json({error:"Flight check unavailable"},{status:503});}
}}}});

// Mission Intelligence — thin server functions.
// Reuses the shared income ledger from getSimflyPayload. Adds NO accounting.

import { createServerFn } from "@tanstack/react-start";
import { predictMission, type MissionInputs, type MissionPrediction } from "./mission-engine";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type MissionCatalog = {
 owned: { icao: string; name: string; lat?: number; lon?: number }[];
 myAirframes: { aircraftId: string; label: string; icao: string; tailNumber?: string }[];
 otherAirframes: { aircraftId: string; label: string; icao: string; tailNumber?: string }[];
 licences: { code: string; name: string }[];
};

export const getMissionCatalog = createServerFn({ method: "GET" })
 .inputValidator((d?: { username?: string }) => d ?? {})
 .handler(async ({ data }): Promise<MissionCatalog> => {
 try {
 const { getSimflyPayload, getAirportGeo } = await import("./simfly.functions");
 
 const payload = await getSimflyPayload({
 data: data.username ? { username: data.username } : undefined,
 });
 
 const icaos = payload.airports.map((a) => a.icao);
 const geo = icaos.length > 0 ? await getAirportGeo({ data: { icaos } }) : [];
 const geoMap = new Map(geo.map((g) => [g.icao.toUpperCase(), g]));

 // 1. Mapujemy własne samoloty zalogowanego pilota
 const myAirframes = (payload.airplanes || [])
 .filter((p) => p.aircraftId)
 .map((p) => ({
 aircraftId: p.aircraftId,
 label: p.name || p.tailNumber || p.icao || p.aircraftId,
 icao: p.icao,
 tailNumber: p.tailNumber,
 }));

 const myOwnedIds = new Set(myAirframes.map((a) => a.aircraftId));
 const otherAirframes: { aircraftId: string; label: string; icao: string; tailNumber?: string }[] = [];

 // 2. POBIERANIE WYŁĄCZNIE SAMOLOTÓW INNYCH GRACZY (Z NUMEREM REJESTRACYJNYM)
 try {
 if (icaos.length > 0) {
 // Odpytujemy bazę o loty na naszych hubach, odrzucając systemowe NULL-e już w SQL
 const { data: rows } = await supabaseAdmin
 .from("simfly_flights")
 .select("aircraft_id, aircraft, aircraft_icao, aircraft_tail_number")
 .not("aircraft_id", "is", null)
 .not("aircraft_tail_number", "is", null) // <--- TEN WARUNEK CAŁKOWICIE ODSIEWA SAMOLOTY SYSTEMOWE
 .or(`departure_icao.in.(${icaos.join(",")}),destination_icao.in.(${icaos.join(",")})`);

 if (rows && rows.length > 0) {
 const uniquePlanes = new Map<string, any>();
 
 for (const r of rows) {
 // Pomijamy maszyny, które są własnością zalogowanego pilota
 if (myOwnedIds.has(r.aircraft_id)) continue;

 // Zapisujemy unikalny samolot gracza (wiemy, że ma tail number dzięki filtrowi SQL)
 if (!uniquePlanes.has(r.aircraft_id)) {
 uniquePlanes.set(r.aircraft_id, {
 aircraftId: r.aircraft_id,
 label: `${r.aircraft || "Unknown"} — ${r.aircraft_tail_number}`,
 icao: r.aircraft_icao || "ICAO",
 tailNumber: r.aircraft_tail_number,
 });
 }
 }
 otherAirframes.push(...uniquePlanes.values());
 }
 }
 } catch (dbErr) {
 console.error("[CATALOG DATABASE FETCH ERROR]", dbErr);
 }

 return {
 owned: (payload.airports || []).map((a) => {
 const g = geoMap.get(a.icao.toUpperCase());
 return { icao: a.icao, name: a.name, lat: g?.lat, lon: g?.lon };
 }),
 myAirframes,
 otherAirframes,
 licences: (payload.licenses || []).map((l) => ({ code: l.code, name: l.name })),
 };
 } catch (globalCrash) {
 console.error("[CRITICAL CATALOG CRASH]", globalCrash);
 return { owned: [], myAirframes: [], otherAirframes: [], licences: [] };
 }
 });


export type PredictMissionInput = {
  username?: string;
  departure: string;
  arrival: string;
  aircraftId?: string;
  licence?: string;
};

export const predictMissionFn = createServerFn({ method: "GET" })
  .inputValidator((d: PredictMissionInput) => d)
  .handler(async ({ data }): Promise<MissionPrediction> => {
    const { getSimflyPayload, getAirportGeo } = await import("./simfly.functions");
    const { evidenceFromPayload } = await import("./mission-evidence.server");
    const payload = await getSimflyPayload({
      data: data.username ? { username: data.username } : undefined,
    });
    const geo = await getAirportGeo({ data: { icaos: [data.departure, data.arrival] } });
    const gMap = new Map(geo.map((g) => [g.icao.toUpperCase(), g]));
    const gDep = gMap.get(data.departure.toUpperCase());
    const gArr = gMap.get(data.arrival.toUpperCase());
    const ac = data.aircraftId
      ? payload.airplanes.find((p) => p.aircraftId === data.aircraftId)
      : undefined;
    const inputs: MissionInputs = {
      departure: { icao: data.departure.toUpperCase(), lat: gDep?.lat, lon: gDep?.lon },
      arrival: { icao: data.arrival.toUpperCase(), lat: gArr?.lat, lon: gArr?.lon },
      aircraftId: data.aircraftId,
      aircraftIcao: ac?.icao,
      aircraftLabel: ac?.name,
      licence: data.licence,
    };
    return predictMission(inputs, evidenceFromPayload(payload));
  });

export type RankMissionsInput = {
  username?: string;
  departure: string;
  aircraftId?: string;
  licence?: string;
  sort?: "total" | "pph" | "confidence";
};

export type RankedMission = {
  arrival: string;
  arrivalName: string;
  distanceNm: number | null;
  flightTimeMs: number | null;
  totalPax: number;
  paxPerHour: number | null;
  confidence: number;
  components: { key: string; value: number }[];
};

export const rankMissionsFn = createServerFn({ method: "GET" })
  .inputValidator((d: RankMissionsInput) => d)
  .handler(async ({ data }): Promise<{ results: RankedMission[]; scanned: number }> => {
    const { getSimflyPayload, getAirportGeo } = await import("./simfly.functions");
    const { evidenceFromPayload } = await import("./mission-evidence.server");
    const payload = await getSimflyPayload({
      data: data.username ? { username: data.username } : undefined,
    });

    const depUp = data.departure.toUpperCase();
    const candidates = payload.airports.map((a) => a.icao.toUpperCase()).filter((c) => c !== depUp);
    const allIcaos = Array.from(new Set([depUp, ...candidates]));
    const geo = allIcaos.length > 0 ? await getAirportGeo({ data: { icaos: allIcaos } }) : [];
    const gMap = new Map(geo.map((g) => [g.icao.toUpperCase(), g]));
    const gDep = gMap.get(depUp);

    const ac = data.aircraftId
      ? payload.airplanes.find((p) => p.aircraftId === data.aircraftId)
      : undefined;
    const evidence = evidenceFromPayload(payload);

    const results: RankedMission[] = [];
    for (const arr of candidates) {
      const gArr = gMap.get(arr);
      const inputs: MissionInputs = {
        departure: { icao: depUp, lat: gDep?.lat, lon: gDep?.lon },
        arrival: { icao: arr, lat: gArr?.lat, lon: gArr?.lon },
        aircraftId: data.aircraftId,
        aircraftIcao: ac?.icao,
        licence: data.licence,
      };
      const p = predictMission(inputs, evidence);
      results.push({
        arrival: arr,
        arrivalName: payload.airports.find((a) => a.icao.toUpperCase() === arr)?.name ?? arr,
        distanceNm: p.distanceNm,
        flightTimeMs: p.flightTimeMs,
        totalPax: p.totalPax,
        paxPerHour: p.paxPerHour,
        confidence: p.overallConfidence,
        components: p.components.map((c) => ({ key: c.key, value: c.value })),
      });
    }

    const sortKey = data.sort ?? "pph";
    results.sort((a, b) => {
      if (sortKey === "total") return b.totalPax - a.totalPax;
      if (sortKey === "confidence") return b.confidence - a.confidence;
      return (b.paxPerHour ?? 0) - (a.paxPerHour ?? 0);
    });

    return { results, scanned: candidates.length };
  });

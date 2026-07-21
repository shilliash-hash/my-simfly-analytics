// Mission Intelligence — thin server functions.
// Reuses the shared income ledger from getSimflyPayload. Adds NO accounting.
import { createServerFn } from "@tanstack/react-start";
import { predictMission, type MissionInputs, type MissionPrediction } from "./mission-engine";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type MissionCatalog = {
 owned: { icao: string; name: string; lat?: number; lon?: number }[];
 myAirframes: { aircraftId: string; label: string; icao: string; tailNumber?: string }[];
 otherAirframes: { aircraftId: string; label: string; icao: string; tailNumber?: string }[];
 genericAirframes: { aircraftId: string; label: string; icao: string; tailNumber?: string }[];
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
 const uniquePlanes = new Map<string, any>(); // Deklaracja na wyższym poziomie, aby uniknąć błędów zasięgu zmiennej

 // 2. POBIERANIE WYŁĄCZNIE SAMOLOTÓW INNYCH GRACZY (Z NUMEREM REJESTRACYJNYM)
 try {
 if (icaos.length > 0) {
 // Odpytujemy bazę o loty na naszych hubach, odrzucając systemowe NULL-e już w SQL
 const { data: rows } = await supabaseAdmin
 .from("simfly_flights")
 .select("aircraft_id, aircraft, aircraft_icao, aircraft_tail_number")
 .not("aircraft_id", "is", null)
 .not("aircraft_tail_number", "is", null)
 .or(`departure_icao.in.(${icaos.join(",")}),destination_icao.in.(${icaos.join(",")})`);

 if (rows && rows.length > 0) {
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
 }
 }
 } catch (dbErr) {
 console.error("[CATALOG DATABASE FETCH ERROR]", dbErr);
 }

 // DEFINICJA GENERIC: Deklarujemy ją TUTAJ - całkowicie poza blokami bazodanowymi.
 // Dzięki temu te 7 linii wygeneruje się ZAWSZE, nawet przy zerowej historii w bazie.
 const genericAirframes = [
 { aircraftId: "generic-t1-single-piston", label: "T1: GENERIC SINGLE PISTON (C172 / P28A)", icao: "C172", tailNumber: "SYSTEM" },
 { aircraftId: "generic-t2-single-turboprop", label: "T2: GENERIC SINGLE TURBOPROP (C208 / PC12)", icao: "C208", tailNumber: "SYSTEM" },
 { aircraftId: "generic-t3-twin-turboprop", label: "T3: GENERIC TWIN TURBOPROP (TBM9 / AT76 / B350)", icao: "TBM9", tailNumber: "SYSTEM" },
 { aircraftId: "generic-t4-twin-piston", label: "T4: GENERIC TWIN PISTON (BARO / DA42 / C310)", icao: "DA42", tailNumber: "SYSTEM" },
 { aircraftId: "generic-t5-regional-jet", label: "T5: GENERIC REGIONAL JET (CRJ9 / E190 / C510)", icao: "CRJ9", tailNumber: "SYSTEM" },
 { aircraftId: "generic-t6-narrowbody", label: "T6: GENERIC NARROWBODY (A320 / B738 / MD82)", icao: "A320", tailNumber: "SYSTEM" },
 { aircraftId: "generic-t7-widebody", label: "T7: GENERIC WIDEBODY (A359 / B77W / B744)", icao: "A359", tailNumber: "SYSTEM" },
 ];

 return {
 owned: (payload.airports || []).map((a) => {
 const g = geoMap.get(a.icao.toUpperCase());
 return { icao: a.icao, name: a.name, lat: g?.lat, lon: g?.lon };
 }),
 myAirframes,
 otherAirframes: Array.from(uniquePlanes.values()),
 genericAirframes,
 licences: (payload.licenses || []).map((l) => ({ code: l.code, name: l.name })),
 };
 } catch (globalCrash) {
 console.error("[CRITICAL CATALOG CRASH]", globalCrash);
 return { owned: [], myAirframes: [], otherAirframes: [], genericAirframes: [], licences: [] };
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

     // 1. UNIWERSALNY SKANER PAYLOADU: Przeszukujemy wszystkie potencjalne tablice z API simfly.io,
  // aby bezbłędnie namierzyć kontrakt misji rynkowej powiązany z przesyłanym ID samolotu.
  let marketMission: any = undefined;
  
  // Sprawdzamy standardową tablicę misji
  if (payload.missions?.length) {
    marketMission = payload.missions.find((m: any) => m.aircraftId === data.aircraftId || m.id === data.aircraftId || m.aircraft_id === data.aircraftId);
  }
  
  // Skan alternatywny: Często w API simfly.io misje rynkowe przychodzą w dedykowanej tablicy marketMissions
  if (!marketMission && (payload as any).marketMissions?.length) {
    marketMission = (payload as any).marketMissions.find((m: any) => m.aircraftId === data.aircraftId || m.id === data.aircraftId || m.aircraft_id === data.aircraftId);
  }

  // Skan floty globalnej: Sprawdzamy czy kod ICAO nie jest zaszyty bezpośrednio w ogólnodostępnej flocie (rentals/market)
  let marketAircraftIcao: string | undefined = undefined;
  if ((payload as any).marketAirplanes?.length) {
    const marketAc = (payload as any).marketAirplanes.find((p: any) => p.aircraftId === data.aircraftId || p.id === data.aircraftId);
    if (marketAc?.icao) marketAircraftIcao = marketAc.icao;
  }
  if (!marketAircraftIcao && (payload as any).rentals?.length) {
    const marketAc = (payload as any).rentals.find((p: any) => p.aircraftId === data.aircraftId || p.id === data.aircraftId);
    if (marketAc?.icao) marketAircraftIcao = marketAc.icao;
  }

 const depInfra = await getAirportMetaWithWeeklyCache(data.departure);
 const arrInfra = await getAirportMetaWithWeeklyCache(data.arrival);

 // 3. Budujemy czysty, fabryczny i bezpieczny obiekt inputs dla silnika predykcji
  // 2. PRODUKCYJNE SKANOWANIE GLOBALNEGO PAYLOADU (Nazwy pól zsynchronizowane z podstroną My Airports)
 const depAirport = payload.airports?.find((a: any) => a.icao.toUpperCase() === data.departure.toUpperCase().trim());
 const arrAirport = payload.airports?.find((a: any) => a.icao.toUpperCase() === data.arrival.toUpperCase().trim());

 const finalDepTier = depAirport?.tier || depAirport?.category || 1;
 const finalDepLevel = depAirport?.level || 1;
 const finalArrTier = arrAirport?.tier || arrAirport?.category || 1;
 const finalArrLevel = arrAirport?.level || 1;
   
 const inputs: MissionInputs = {
 departure: { icao: data.departure.toUpperCase().trim(), lat: gDep?.lat, lon: gDep?.lon },
 arrival: { icao: data.arrival.toUpperCase().trim(), lat: gArr?.lat, lon: gArr?.lon },
 aircraftId: data.aircraftId,
 
 aircraftIcao: (() => {
 if (ac?.icao) return ac.icao;
 if (marketMission?.aircraft_icao) return marketMission.aircraft_icao;
 if (marketMission?.aircraft?.icao) return marketMission.aircraft.icao;
 if (marketMission?.aircraftIcao) return marketMission.aircraftIcao;
 if (marketAircraftIcao) return marketAircraftIcao;
 
 return (data as any).aircraftIcao;
 })(),
  aircraftLabel: ac?.name || marketMission?.aircraft_name || "Rental Aircraft",
 licence: data.licence,
 
 // NOWOŚĆ: Nasycamy inputs autentycznymi liczbami z globalnego katalogu (Gwarancja braku błędu NaN!)
 departureAirportTier: finalDepTier,
 departureAirportLevel: finalDepLevel,
 destAirportTier: finalArrTier,
 destAirportLevel: finalArrLevel,
 };

 // 4. Przekazujemy inputs oraz evidence bezpośrednio do czystego silnika predykcji w mission-engine.ts
 return predictMission(inputs, evidenceFromPayload(payload));
});



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

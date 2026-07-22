// Mission Intelligence — server-only evidence assembly.
// Kept in a *.server.ts file so it can never leak into client bundles.

import type { SimflyPayload } from "./types";
import { buildEvidence, type MissionEvidence, type TierMatrix, type MatrixCell } from "./mission-engine";
import { lookupAircraftSpec } from "./aircraft-specs";

export function buildAircraftIcaoMap(payload: SimflyPayload): Record<string, string> {
  const map: Record<string, string> = {};
  for (const p of payload.airplanes) {
    const id = p.aircraftId || (p as any).aircraft_id;
    if (id && p.icao) map[id] = p.icao;
  }
  return map;
}

export function buildAircraftCatMap(payload: SimflyPayload): Record<string, number> {
  const map: Record<string, number> = {};
  for (const p of payload.airplanes) {
    const id = p.aircraftId || (p as any).aircraft_id;
    if (id && Number.isFinite(p.category)) map[id] = p.category;
  }
  return map;
}


export function buildAirportCatMap(payload: SimflyPayload): Record<string, number> {
  const map: Record<string, number> = {};
  for (const a of payload.airports) {
    if (a.icao && Number.isFinite(a.category)) map[a.icao.toUpperCase()] = a.category;
  }
  return map;
}

export function buildCurrentAirportPilotPct(payload: SimflyPayload): Record<string, number> {
  const map: Record<string, number> = {};
  for (const a of payload.airports) {
    if (a.icao && Number.isFinite(a.percToUser)) {
      map[a.icao.toUpperCase()] = a.percToUser;
    }
  }
  return map;
}

export function evidenceFromPayload(
  payload: SimflyPayload,
  extraAirportCat?: Record<string, number>,
): MissionEvidence {
  if (!payload.incomeLedger) {
    throw new Error("Income ledger missing from SimflyPayload");
  }
  const airportCat = { ...buildAirportCatMap(payload) };
  if (extraAirportCat) {
    for (const [k, v] of Object.entries(extraAirportCat)) {
      const up = k.toUpperCase();
      if (Number.isFinite(v) && !(up in airportCat)) airportCat[up] = v;
    }
  }
  return buildEvidence({
    ledger: payload.incomeLedger,
    aircraftIcaoById: buildAircraftIcaoMap(payload),
    aircraftCatById: buildAircraftCatMap(payload),
    airportCatByIcao: airportCat,
    currentAirportPilotPct: buildCurrentAirportPilotPct(payload),
  });
}

// ---------- Community intelligence ----------

/**
 * Build community airport matrices from public simfly_flights table.
 * Approximates airport-attributable PAX as pax × k where k is a per-tier scalar
 * derived from the caller's own ledger (median airport share ÷ median total pax).
 * No new accounting; reuses ratios already implicit in the ledger.
 */
export async function buildCommunityMatrices(args: {
  aircraftTier: number | undefined;
  depIcao: string;
  arrIcao: string;
  depTier?: number;
  arrTier?: number;
  ownUsername?: string;
}): Promise<{ dep: TierMatrix; arr: TierMatrix }> {
  const empty = { dep: new Map<string, MatrixCell>(), arr: new Map<string, MatrixCell>() };
  if (!args.aircraftTier) return empty;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const dep = args.depIcao.toUpperCase();
  const arr = args.arrIcao.toUpperCase();

  const query = supabaseAdmin
    .from("simfly_flights")
    .select("aircraft_icao,departure_icao,destination_icao,pax,username")
    .or(`departure_icao.eq.${dep},destination_icao.eq.${arr}`)
    .limit(5000);
  const { data, error } = await query;
  if (error || !data) return empty;

  // Approximation constant: airport share ~ 0.5 * total pax (conservative default).
  const K = 0.5;

  const depBuckets: number[] = [];
  const arrBuckets: number[] = [];
  for (const row of data) {
    if (!row.pax || row.pax <= 0) continue;
    if (args.ownUsername && row.username === args.ownUsername) continue;
    const acIcao = (row.aircraft_icao || "").toUpperCase();
    const spec = lookupAircraftSpec(acIcao)?.spec;
    if (!spec || spec.category !== args.aircraftTier) continue;
    const airportPortion = row.pax * K;
    if ((row.departure_icao || "").toUpperCase() === dep) depBuckets.push(airportPortion);
    if ((row.destination_icao || "").toUpperCase() === arr) arrBuckets.push(airportPortion);
  }

  const toCell = (xs: number[]): MatrixCell | null => {
    if (xs.length < 3) return null;
    const sorted = [...xs].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const med = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    return { avgPax: med, count: sorted.length };
  };

  const depMatrix: TierMatrix = new Map();
  const arrMatrix: TierMatrix = new Map();
  const depCell = toCell(depBuckets);
  const arrCell = toCell(arrBuckets);
  if (depCell && args.depTier !== undefined) {
    depMatrix.set(`${args.aircraftTier}:${args.depTier}`, depCell);
  }
  if (arrCell && args.arrTier !== undefined) {
    arrMatrix.set(`${args.aircraftTier}:${args.arrTier}`, arrCell);
  }
  return { dep: depMatrix, arr: arrMatrix };
}

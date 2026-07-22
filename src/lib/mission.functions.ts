// Mission Intelligence — thin server functions.
// Reuses the shared income ledger from getSimflyPayload. Adds NO accounting.

import { createServerFn } from "@tanstack/react-start";
import {
  predictMission,
  GENERIC_AIRCRAFT_ID,
  GENERIC_TIERS,
  genericTierId,
  genericTierFromId,
  isGenericAircraftId,
  type MissionInputs,
  type MissionPrediction,
} from "./mission-engine";

export type MissionAircraftMode = "owned" | "rental" | "generic";

export type MissionAircraftOption = {
  aircraftId: string;
  label: string;
  icao: string;
  tailNumber?: string;
  mode: MissionAircraftMode;
  tier?: number; // for generic-tier options
};

export type MissionCatalog = {
  owned: { icao: string; name: string; lat?: number; lon?: number }[];
  aircraft: MissionAircraftOption[];
  licences: { code: string; name: string }[];
};

export const getMissionCatalog = createServerFn({ method: "GET" })
  .inputValidator((d?: { username?: string }) => d ?? {})
  .handler(async ({ data }): Promise<MissionCatalog> => {
    const { getSimflyPayload, getAirportGeo } = await import("./simfly.functions");
    const payload = await getSimflyPayload({
      data: data.username ? { username: data.username } : undefined,
    });
    const icaos = payload.airports.map((a) => a.icao);
    const geo = icaos.length > 0 ? await getAirportGeo({ data: { icaos } }) : [];
    const geoMap = new Map(geo.map((g) => [g.icao.toUpperCase(), g]));

    const owned: MissionAircraftOption[] = payload.airplanes
      .filter((p) => p.aircraftId)
      .map((p) => ({
        aircraftId: p.aircraftId,
        label: p.name || p.tailNumber || p.icao || p.aircraftId,
        icao: p.icao,
        tailNumber: p.tailNumber,
        mode: "owned" as const,
      }));

    // Rentals — historical aircraft the pilot flew but doesn't own, derived from ledger.
    const rentalMap = new Map<string, MissionAircraftOption>();
    if (payload.incomeLedger) {
      const ownedIds = new Set(payload.incomeLedger.ownedAircraft.map((a) => a.aircraftId));
      for (const f of payload.incomeLedger.myFlights) {
        if (!f.aircraftId || ownedIds.has(f.aircraftId)) continue;
        if (rentalMap.has(f.aircraftId)) continue;
        rentalMap.set(f.aircraftId, {
          aircraftId: f.aircraftId,
          label: f.aircraftLabel || f.aircraftId,
          icao: "",
          mode: "rental",
        });
      }
    }
    const rentals = Array.from(rentalMap.values()).sort((a, b) =>
      a.label.localeCompare(b.label),
    );

    const generics: MissionAircraftOption[] = GENERIC_TIERS.map((t) => ({
      aircraftId: genericTierId(t),
      label: `Generic Tier ${t}`,
      icao: "",
      mode: "generic" as const,
      tier: t,
    }));

    return {
      owned: payload.airports.map((a) => {
        const g = geoMap.get(a.icao.toUpperCase());
        return { icao: a.icao, name: a.name, lat: g?.lat, lon: g?.lon };
      }),
      aircraft: [...owned, ...rentals, ...generics],
      licences: payload.licenses.map((l) => ({ code: l.code, name: l.name })),
    };
  });

export type PredictMissionInput = {
  username?: string;
  departure: string;
  arrival: string;
  aircraftId?: string;
  licence?: string;
  useCommunity?: boolean;
};

async function resolveAircraftInputs(
  payload: Awaited<ReturnType<typeof import("./simfly.functions").getSimflyPayload>>,
  aircraftId: string | undefined,
): Promise<{
  aircraftId?: string;
  aircraftIcao?: string;
  aircraftLabel?: string;
  aircraftTier?: number;
}> {
  if (!aircraftId) return {};
  if (isGenericAircraftId(aircraftId)) {
    const tier = genericTierFromId(aircraftId);
    return {
      aircraftId,
      aircraftLabel: tier ? `Generic Tier ${tier}` : "Generic plane",
      aircraftTier: tier,
    };
  }
  const owned = payload.airplanes.find((p) => p.aircraftId === aircraftId);
  if (owned) {
    return {
      aircraftId,
      aircraftIcao: owned.icao,
      aircraftLabel: owned.name,
      aircraftTier: Number.isFinite(owned.category) ? owned.category : undefined,
    };
  }
  // Rental — look up from ledger.
  const rental = payload.incomeLedger?.myFlights.find((f) => f.aircraftId === aircraftId);
  return {
    aircraftId,
    aircraftIcao: undefined,
    aircraftLabel: rental?.aircraftLabel || aircraftId,
  };
}

export const predictMissionFn = createServerFn({ method: "GET" })
  .inputValidator((d: PredictMissionInput) => d)
  .handler(async ({ data }): Promise<MissionPrediction> => {
    const { getSimflyPayload, getAirportGeo, getAirportsMeta } = await import("./simfly.functions");
    const { evidenceFromPayload, buildCommunityMatrices } = await import("./mission-evidence.server");
    const payload = await getSimflyPayload({
      data: data.username ? { username: data.username } : undefined,
    });
    const geo = await getAirportGeo({ data: { icaos: [data.departure, data.arrival] } });
    const gMap = new Map(geo.map((g) => [g.icao.toUpperCase(), g]));
    const gDep = gMap.get(data.departure.toUpperCase());
    const gArr = gMap.get(data.arrival.toUpperCase());

    const meta = await getAirportsMeta({ data: { icaos: [data.departure, data.arrival] } });
    const extra: Record<string, number> = {};
    for (const m of meta) extra[m.icao.toUpperCase()] = m.category;

    const ac = await resolveAircraftInputs(payload, data.aircraftId);
    const inputs: MissionInputs = {
      departure: { icao: data.departure.toUpperCase(), lat: gDep?.lat, lon: gDep?.lon },
      arrival: { icao: data.arrival.toUpperCase(), lat: gArr?.lat, lon: gArr?.lon },
      aircraftId: ac.aircraftId,
      aircraftIcao: ac.aircraftIcao,
      aircraftLabel: ac.aircraftLabel,
      aircraftTier: ac.aircraftTier,
      licence: data.licence,
    };

    const evidence = evidenceFromPayload(payload, extra);
    if (data.useCommunity) {
      const community = await buildCommunityMatrices({
        aircraftTier: ac.aircraftTier,
        depIcao: inputs.departure.icao,
        arrIcao: inputs.arrival.icao,
        depTier: extra[inputs.departure.icao],
        arrTier: extra[inputs.arrival.icao],
        ownUsername: payload.me?.handle,
      });
      evidence.communityAirportMatrix = community;
      evidence.useCommunity = true;
    }
    return predictMission(inputs, evidence);
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

    const ac = await resolveAircraftInputs(payload, data.aircraftId);
    const evidence = evidenceFromPayload(payload);

    const results: RankedMission[] = [];
    for (const arr of candidates) {
      const gArr = gMap.get(arr);
      const inputs: MissionInputs = {
        departure: { icao: depUp, lat: gDep?.lat, lon: gDep?.lon },
        arrival: { icao: arr, lat: gArr?.lat, lon: gArr?.lon },
        aircraftId: ac.aircraftId,
        aircraftIcao: ac.aircraftIcao,
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

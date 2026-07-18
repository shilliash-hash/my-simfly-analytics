// Mission Intelligence — server-only evidence assembly.
// Kept in a *.server.ts file so it can never leak into client bundles.

import type { SimflyPayload } from "./types";
import { buildEvidence, type MissionEvidence } from "./mission-engine";

export function buildAircraftIcaoMap(payload: SimflyPayload): Record<string, string> {
  const map: Record<string, string> = {};
  for (const p of payload.airplanes) {
    if (p.aircraftId && p.icao) map[p.aircraftId] = p.icao;
  }
  return map;
}

export function evidenceFromPayload(payload: SimflyPayload): MissionEvidence {
  if (!payload.incomeLedger) {
    throw new Error("Income ledger missing from SimflyPayload");
  }
  return buildEvidence({
    ledger: payload.incomeLedger,
    aircraftIcaoById: buildAircraftIcaoMap(payload),
  });
}

// Prediction Ledger — read-only statistical layer for Mission Intelligence.
//
// This module transforms the shared IncomeLedger into a dataset optimized for
// prediction. It does NOT modify the IncomeLedger, does NOT write to the
// database, and does NOT affect accounting, statistics, or reports.
//
// Purpose: answer the question "Historically, how much income does this
// aircraft usually generate?" for a future flight.

import type { IncomeLedger } from "./types";

/** Licence baseline used to reconstruct aircraft income from the ledger. */
export type PredictionLicenceBaseline = {
  code: string;
  medianPaxOther: number;
  sampleSize: number;
};

/** One historical flight as seen by the prediction engine. */
export type PredictionFlight = {
  flightId: string;
  ts: string;
  aircraftId: string;
  originIcao: string;
  destIcao: string;
  licence?: string;
  /** Reconstructed total aircraft income received by the owner-pilot. */
  effectiveAircraftIncome: number;
  /** Original ledger values for transparency and diagnostics. */
  pax: number;
  paxAircraftOwn: number;
  paxAirportOwn: number;
  paxOther: number;
  licencePortion: number;
};

/** Read-only statistical layer consumed by Mission Intelligence. */
export type PredictionLedger = {
  aircraftFlights: PredictionFlight[];
  licenceBaselines: PredictionLicenceBaseline[];
  /** Total ledger rows examined (my flights on owned aircraft). */
  examinedRows: number;
  /** Rows removed because effectiveAircraftIncome was zero. */
  filteredRows: number;
  /** Methodological note for diagnostics. */
  note: string;
};

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

function buildLicenceBaselines(ledger: IncomeLedger): PredictionLicenceBaseline[] {
  const byCode = new Map<string, number[]>();
  for (const f of ledger.myFlights) {
    const code = (f.licence || "").toUpperCase();
    if (!code) continue;
    let arr = byCode.get(code);
    if (!arr) {
      arr = [];
      byCode.set(code, arr);
    }
    arr.push(f.paxOther);
  }
  const out: PredictionLicenceBaseline[] = [];
  for (const [code, xs] of byCode) {
    out.push({ code, medianPaxOther: median(xs), sampleSize: xs.length });
  }
  return out;
}

/**
 * Build a read-only Prediction Ledger from the Income Ledger.
 *
 * For owned aircraft, the prediction engine works with the combined aircraft
 * income actually received by the active user (owner + pilot slice), because
 * when the owner and pilot are the same person both portions belong to the
 * same user. This is reconstructed as:
 *
 *   effectiveAircraftIncome = pax - paxAirportOwn - licencePortion
 *
 * where licencePortion is the median paxOther for the licence code. Rows with
 * zero effective aircraft income are filtered out because they carry no
 * predictive signal for aircraft earnings.
 *
 * The input ledger is never mutated.
 */
export function buildPredictionLedger(ledger: IncomeLedger): PredictionLedger {
  const licenceBaselines = buildLicenceBaselines(ledger);
  const baselineMap = new Map(
    licenceBaselines.map((b) => [b.code, b.medianPaxOther]),
  );
  const ownedIds = new Set(ledger.ownedAircraft.map((a) => a.aircraftId));

  const aircraftFlights: PredictionFlight[] = [];
  let examinedRows = 0;
  let filteredRows = 0;

  for (const f of ledger.myFlights) {
    if (!f.aircraftId || !ownedIds.has(f.aircraftId)) continue;
    examinedRows += 1;

    const licencePortion =
      baselineMap.get((f.licence || "").toUpperCase()) ?? 0;
    const effectiveAircraftIncome = Math.max(
      0,
      f.pax - f.paxAirportOwn - licencePortion,
    );

    if (effectiveAircraftIncome <= 0) {
      filteredRows += 1;
      continue;
    }

    aircraftFlights.push({
      flightId: f.flightId,
      ts: f.ts,
      aircraftId: f.aircraftId,
      originIcao: f.originIcao,
      destIcao: f.destIcao,
      licence: f.licence,
      effectiveAircraftIncome,
      pax: f.pax,
      paxAircraftOwn: f.paxAircraftOwn,
      paxAirportOwn: f.paxAirportOwn,
      paxOther: f.paxOther,
      licencePortion,
    });
  }

  return {
    aircraftFlights,
    licenceBaselines,
    examinedRows,
    filteredRows,
    note: "effectiveAircraftIncome = pax - paxAirportOwn - licencePortion; zero rows removed for prediction only.",
  };
}

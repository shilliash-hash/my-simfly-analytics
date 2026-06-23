// Pure helpers for merging visitor-flight signals.
//
// Two independent SimFly endpoints surface flights where another pilot
// generates PAX for me:
//
//   • per-airport history  → I get `paxAirport` (airport owner's cut). One
//                             entry per owned hub the flight touched, so the
//                             same flight can appear at BOTH origin and
//                             destination when I own both.
//   • per-aircraft history → I get `paxAircraft` (aircraft owner's cut).
//                             One entry per flight, regardless of routing.
//
// Merging rules (kept verbatim in tests):
//   1. paxAirport sums across hubs (origin + destination both belong to me).
//   2. paxAircraft is per-flight — when reported by multiple sources, take
//      the max instead of summing, otherwise the same rental cut counts
//      twice.
//   3. A flight known only from the aircraft scan is added as-is.

import type { AirportFlightHistoryItem } from "./types";

export type VisitorFlightWithHub = AirportFlightHistoryItem & {
  airportIcao: string;
};

export function mergeVisitorFlights(
  airportItems: VisitorFlightWithHub[],
  aircraftItems: VisitorFlightWithHub[] = [],
): VisitorFlightWithHub[] {
  const byId = new Map<string, VisitorFlightWithHub>();

  for (const v of airportItems) {
    const prev = byId.get(v.id);
    if (!prev) {
      byId.set(v.id, { ...v });
      continue;
    }
    byId.set(v.id, {
      ...prev,
      paxAirport: prev.paxAirport + v.paxAirport,
      paxAircraft: Math.max(prev.paxAircraft ?? 0, v.paxAircraft ?? 0),
    });
  }

  for (const v of aircraftItems) {
    const prev = byId.get(v.id);
    if (!prev) {
      byId.set(v.id, { ...v });
      continue;
    }
    byId.set(v.id, {
      ...prev,
      paxAircraft: Math.max(prev.paxAircraft ?? 0, v.paxAircraft ?? 0),
    });
  }

  return [...byId.values()];
}

/** Fold visitor PAX (airport leg + aircraft rental) into daily totals. */
export function visitorPaxByDay(
  flights: VisitorFlightWithHub[],
): Map<string, number> {
  const byDay = new Map<string, number>();
  for (const v of flights) {
    const day = (v.ts || "").slice(0, 10);
    if (!day) continue;
    const total = (v.paxAirport || 0) + (v.paxAircraft || 0);
    byDay.set(day, (byDay.get(day) ?? 0) + total);
  }
  return byDay;
}

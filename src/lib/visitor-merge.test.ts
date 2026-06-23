import { describe, expect, it } from "vitest";
import {
  mergeVisitorFlights,
  visitorPaxByDay,
  type VisitorFlightWithHub,
} from "./visitor-merge";

function flight(over: Partial<VisitorFlightWithHub> = {}): VisitorFlightWithHub {
  return {
    id: "F",
    ts: "2026-06-20T10:00:00Z",
    visitor: "maglestat",
    isOwner: false,
    role: "takeoff",
    otherIcao: "ENAL",
    paxVisitor: 3,
    paxAirport: 0,
    paxAircraft: 0,
    aircraft: "Airbus A350-900",
    airportIcao: "LIRA",
    ...over,
  };
}

describe("mergeVisitorFlights", () => {
  it("sums paxAirport when the same flight touches two of my hubs", () => {
    // I own both origin (LIRA) and destination (ENAL). The airport scan
    // surfaces the same flight from BOTH hubs — origin owner cut + dest owner cut.
    const merged = mergeVisitorFlights([
      flight({ id: "F1", airportIcao: "LIRA", paxAirport: 0.5 }),
      flight({ id: "F1", airportIcao: "ENAL", paxAirport: 1.2 }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].paxAirport).toBeCloseTo(1.7, 5);
  });

  it("does NOT double-count paxAircraft when both airport entries report it", () => {
    // Both hub entries carry the aircraft cut (same per-flight value).
    // Summing would double-count my rental income.
    const merged = mergeVisitorFlights([
      flight({ id: "F2", airportIcao: "LIRA", paxAirport: 0.5, paxAircraft: 1.84 }),
      flight({ id: "F2", airportIcao: "ENAL", paxAirport: 1.2, paxAircraft: 1.84 }),
    ]);
    expect(merged[0].paxAircraft).toBeCloseTo(1.84, 5);
    expect(merged[0].paxAirport).toBeCloseTo(1.7, 5);
  });

  it("adds aircraft-only flights when no hub I own was touched", () => {
    // Flight between two airports I don't own — surfaces only via the
    // per-aircraft endpoint. Must still appear in my income/activity.
    const merged = mergeVisitorFlights(
      [], // no airport scan hits
      [flight({ id: "F3", airportIcao: "EHAM", paxAirport: 0, paxAircraft: 1.07 })],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe("F3");
    expect(merged[0].paxAircraft).toBeCloseTo(1.07, 5);
  });

  it("merges aircraft-scan paxAircraft into a flight already known from a hub", () => {
    // Airport scan saw the flight at one of my hubs but reported paxAircraft=0
    // (e.g. partial page) — aircraft scan supplies the rental cut.
    const merged = mergeVisitorFlights(
      [flight({ id: "F4", airportIcao: "ENVA", paxAirport: 0.8, paxAircraft: 0 })],
      [flight({ id: "F4", airportIcao: "ENVA", paxAirport: 0, paxAircraft: 1.15 })],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].paxAirport).toBeCloseTo(0.8, 5);
    expect(merged[0].paxAircraft).toBeCloseTo(1.15, 5);
  });

  it("takes max paxAircraft when both sources report a non-zero value", () => {
    const merged = mergeVisitorFlights(
      [flight({ id: "F5", paxAircraft: 1.0 })],
      [flight({ id: "F5", paxAircraft: 1.2 })],
    );
    expect(merged[0].paxAircraft).toBeCloseTo(1.2, 5);
  });

  it("preserves unrelated flights independently", () => {
    const merged = mergeVisitorFlights(
      [
        flight({ id: "A", airportIcao: "LIRA", paxAirport: 0.5 }),
        flight({ id: "B", airportIcao: "ENAL", paxAirport: 0.3 }),
      ],
      [flight({ id: "C", paxAircraft: 0.9 })],
    );
    expect(merged.map((m) => m.id).sort()).toEqual(["A", "B", "C"]);
  });
});

describe("visitorPaxByDay", () => {
  it("sums airport+aircraft PAX into the day bucket", () => {
    const byDay = visitorPaxByDay([
      flight({ ts: "2026-06-22T10:00:00Z", paxAirport: 0.5, paxAircraft: 1.84 }),
      flight({ ts: "2026-06-22T18:00:00Z", paxAirport: 0, paxAircraft: 1.07 }),
      flight({ ts: "2026-06-21T05:47:00Z", paxAirport: 0.3, paxAircraft: 0 }),
    ]);
    expect(byDay.get("2026-06-22")).toBeCloseTo(3.41, 5);
    expect(byDay.get("2026-06-21")).toBeCloseTo(0.3, 5);
  });

  it("ignores entries with no timestamp", () => {
    const byDay = visitorPaxByDay([flight({ ts: "", paxAircraft: 1 })]);
    expect(byDay.size).toBe(0);
  });

  it("end-to-end: dedupe-then-aggregate matches expected daily total", () => {
    // The maglestat A350 flight from the live mission log:
    //   ts 2026-06-22, paxAircraft 1.84, between two airports I don't own.
    // Plus a LuigiThePlumber flight visible BOTH via aircraft history
    // (paxAircraft 1.15) AND via the ENVA hub airport history (paxAirport 0.45).
    // Expected total on 2026-06-22 = 1.84 + (1.15 + 0.45) = 3.44.
    const merged = mergeVisitorFlights(
      [
        flight({
          id: "luigi",
          ts: "2026-06-22T12:54:30Z",
          visitor: "LuigiThePlumber",
          airportIcao: "ENVA",
          paxAirport: 0.45,
          paxAircraft: 1.15,
        }),
      ],
      [
        flight({
          id: "maglestat",
          ts: "2026-06-22T19:11:46Z",
          visitor: "maglestat",
          airportIcao: "LIRA",
          paxAirport: 0,
          paxAircraft: 1.84,
        }),
        flight({
          id: "luigi",
          ts: "2026-06-22T12:54:30Z",
          visitor: "LuigiThePlumber",
          airportIcao: "ENVA",
          paxAirport: 0,
          paxAircraft: 1.15,
        }),
      ],
    );
    const byDay = visitorPaxByDay(merged);
    expect(byDay.get("2026-06-22")).toBeCloseTo(3.44, 5);
  });
});

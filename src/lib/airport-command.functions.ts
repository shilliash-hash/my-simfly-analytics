// Airport Command Center — orchestration layer only.
//
// Every value in this module is consumed from an existing intelligence
// module (Airport Intelligence, Aircraft Intelligence, Income Intelligence,
// Upgrade Advisor, Community Radar, Activity Intelligence). Nothing here
// invents a formula, a score, a ranking or an ownership rule: the code
// groups and shapes already-published outputs for presentation.

import { createServerFn } from "@tanstack/react-start";

// ---------------------------------------------------------------------------
// Shared types (client-safe)
// ---------------------------------------------------------------------------

export type CommandWeekRef = {
  /** Monday 00:00 UTC of the active analysis week. */
  weekStartIso: string;
  weekNumber: number;
};

export type CommandConfidence = {
  level: "HIGH" | "MEDIUM" | "LOW";
  operations: number;
  pilots: number;
  weeks: number;
};

export type CommandPulse = {
  icao: string;
  name: string;
  owner: string;
  tier: number;
  level: number;
  capacity: number;
  status: "ACTIVE HUB" | "QUIET";
  snapshot: CommandWeekRef;
  weeklyOperations: number;
  previousWeeklyOperations: number | null;
  trendPct: number | null;
  weeks: { weekNumber: number; weekStartIso: string; used: number; capacity: number }[];
  generatedAt: string;
};

export type CommandActivityRow = {
  id: string;
  ts: string;
  visitor: string;
  isOwnerPilot: boolean;
  aircraft: string;
  aircraftId?: string;
  ownedAircraft: boolean;
  operation: "ARRIVAL" | "DEPARTURE";
  otherIcao: string;
  paxAirport: number;
  paxAircraft: number;
};

export type CommandOwnerImpact = {
  ownedAircraftInvolved: number;
  operationsGenerated: number;
  flightsByOtherPilots: number;
  revenueAttributed: number;
};

export type CommandDna = {
  dominantAircraft: string | null;
  topVisitors: { pilot: string; operations: number }[];
  weekendOps: number;
  weekdayOps: number;
};

export type CommandActivity = {
  icao: string;
  snapshot: CommandWeekRef;
  rows: CommandActivityRow[];
  currentWeek: { arrivals: number; departures: number; operations: number };
  confidence: CommandConfidence;
  ownerImpact: CommandOwnerImpact;
  dna: CommandDna;
  generatedAt: string;
};

export type CommandTierShare = { tier: number; operations: number; pax: number; share: number };
export type CommandLevelShare = { level: number; operations: number; avgPax: number };
export type CommandCombo = { tier: number; level: number; operations: number; avgPax: number };

export type CommandRevenueWeek = {
  weekNumber: number;
  weekStartIso: string;
  operations: number;
  basePax: number;
  bonusPax: number;
};

export type CommandValue = {
  icao: string;
  snapshot: CommandWeekRef;
  tiers: CommandTierShare[];
  levels: CommandLevelShare[];
  combos: CommandCombo[];
  revenueWeeks: CommandRevenueWeek[];
  sampledFlights: number;
  generatedAt: string;
};

export type CommandLiveInbound = {
  id: string;
  pilot: string;
  aircraftName: string;
  aircraftICAO: string;
  tailNumber?: string;
  origin: string;
  etaMs?: number;
  distanceNm?: number;
  isOwnPilot: boolean;
};

export type CommandLive = {
  icao: string;
  inbound: CommandLiveInbound[];
  fetchedAt: string;
};

// ---------------------------------------------------------------------------
// Helpers (labelling only — no analytics)
// ---------------------------------------------------------------------------

const MS_WEEK = 7 * 24 * 60 * 60 * 1000;
const WEEK_EPOCH_MS = Date.UTC(2022, 7, 15, 0, 0, 0);

function weekStartMs(tsMs: number): number {
  const d = new Date(tsMs);
  const mondayOffset = (d.getUTCDay() + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - mondayOffset);
}
function weekNumberOf(ws: number): number {
  return Math.max(1, Math.round((ws - WEEK_EPOCH_MS) / MS_WEEK) + 1);
}

function confidenceOf(operations: number, pilots: number, weeks: number): CommandConfidence {
  let level: CommandConfidence["level"] = "MEDIUM";
  if (operations >= 40 && pilots >= 10 && weeks >= 4) level = "HIGH";
  else if (operations < 10 || weeks < 2) level = "LOW";
  return { level, operations, pilots, weeks };
}

// ---------------------------------------------------------------------------
// Pulse + capacity — Airport Intelligence (utilization timeline)
// ---------------------------------------------------------------------------

export const getCommandPulse = createServerFn({ method: "GET" })
  .inputValidator((d: { icao: string; username?: string }) => ({
    icao: (d?.icao ?? "").trim().toUpperCase(),
    username: d?.username,
  }))
  .handler(async ({ data }): Promise<CommandPulse> => {
    const { getAirportUtilizationTimeline } = await import("./simfly.functions");
    const timeline = await getAirportUtilizationTimeline({
      data: { icaos: [data.icao], ...(data.username ? { username: data.username } : {}) },
    });

    const meta =
      timeline.airportMeta.find((m) => m.icao.toUpperCase() === data.icao) ??
      { icao: data.icao, name: data.icao, category: 0, level: 0, capacity: 0 };

    const weeks = timeline.weeks
      .map((w) => {
        const row = w.byAirport.find((a) => a.icao.toUpperCase() === data.icao);
        return {
          weekNumber: w.weekNumber,
          weekStartIso: w.weekStartIso,
          used: row?.used ?? 0,
          capacity: row?.capacity ?? meta.capacity,
        };
      })
      .sort((a, b) => a.weekNumber - b.weekNumber);

    const nowWeekStart = weekStartMs(Date.now());
    const snapshot: CommandWeekRef = {
      weekStartIso: new Date(nowWeekStart).toISOString(),
      weekNumber: weekNumberOf(nowWeekStart),
    };

    const current = weeks.find((w) => w.weekNumber === snapshot.weekNumber);
    const previous = weeks.find((w) => w.weekNumber === snapshot.weekNumber - 1);
    const weeklyOperations = current?.used ?? 0;
    const previousWeeklyOperations = previous ? previous.used : null;
    const trendPct =
      previousWeeklyOperations && previousWeeklyOperations > 0
        ? ((weeklyOperations - previousWeeklyOperations) / previousWeeklyOperations) * 100
        : null;

    return {
      icao: data.icao,
      name: meta.name,
      owner: data.username ?? "",
      tier: meta.category,
      level: meta.level,
      capacity: current?.capacity ?? meta.capacity,
      status: weeklyOperations > 0 ? "ACTIVE HUB" : "QUIET",
      snapshot,
      weeklyOperations,
      previousWeeklyOperations,
      trendPct,
      weeks: weeks.slice(-16),
      generatedAt: timeline.fetchedAt,
    };
  });

// ---------------------------------------------------------------------------
// Activity, Owner Impact, DNA — Activity Intelligence (airport flight history)
// ---------------------------------------------------------------------------

export const getCommandActivity = createServerFn({ method: "GET" })
  .inputValidator((d: { icao: string; username?: string; pages?: number }) => ({
    icao: (d?.icao ?? "").trim().toUpperCase(),
    username: d?.username,
    pages: Math.min(Math.max(d?.pages ?? 10, 1), 25),
  }))
  .handler(async ({ data }): Promise<CommandActivity> => {
    const { getAirportFlightHistory } = await import("./simfly.functions");
    const hist = await getAirportFlightHistory({
      data: {
        icao: data.icao,
        pages: data.pages,
        ...(data.username ? { username: data.username } : {}),
      },
    });

    const rows: CommandActivityRow[] = hist.items
      .map((it) => ({
        id: it.id,
        ts: it.ts,
        visitor: it.visitor,
        isOwnerPilot: it.isOwner,
        aircraft: it.aircraft,
        aircraftId: it.aircraftId,
        // Ownership is taken from the attribution already produced upstream:
        // a positive aircraft credit means the airport owner owns that plane.
        ownedAircraft: (it.paxAircraft ?? 0) > 0,
        operation: it.role === "landing" ? ("ARRIVAL" as const) : ("DEPARTURE" as const),
        otherIcao: it.otherIcao,
        paxAirport: it.paxAirport,
        paxAircraft: it.paxAircraft ?? 0,
      }))
      .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));

    const nowWeekStart = weekStartMs(Date.now());
    const snapshot: CommandWeekRef = {
      weekStartIso: new Date(nowWeekStart).toISOString(),
      weekNumber: weekNumberOf(nowWeekStart),
    };

    let arrivals = 0;
    let departures = 0;
    const pilots = new Set<string>();
    const weeksSeen = new Set<number>();
    const pilotOps = new Map<string, number>();
    const aircraftOps = new Map<string, number>();
    let weekendOps = 0;
    let weekdayOps = 0;

    const ownedAircraftIds = new Set<string>();
    let operationsGenerated = 0;
    let flightsByOtherPilots = 0;
    let revenueAttributed = 0;

    for (const r of rows) {
      const tsMs = Date.parse(r.ts);
      if (Number.isFinite(tsMs)) {
        const ws = weekStartMs(tsMs);
        weeksSeen.add(ws);
        if (ws === nowWeekStart) {
          if (r.operation === "ARRIVAL") arrivals++;
          else departures++;
        }
        const dow = new Date(tsMs).getUTCDay();
        if (dow === 0 || dow === 6) weekendOps++;
        else weekdayOps++;
      }
      if (r.visitor && r.visitor !== "—") {
        pilots.add(r.visitor.toLowerCase());
        pilotOps.set(r.visitor, (pilotOps.get(r.visitor) ?? 0) + 1);
      }
      if (r.aircraft) aircraftOps.set(r.aircraft, (aircraftOps.get(r.aircraft) ?? 0) + 1);

      if (r.ownedAircraft) {
        operationsGenerated++;
        if (r.aircraftId) ownedAircraftIds.add(r.aircraftId);
      }
      if (!r.isOwnerPilot) flightsByOtherPilots++;
      revenueAttributed += r.paxAirport + r.paxAircraft;
    }

    const topVisitors = [...pilotOps.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([pilot, operations]) => ({ pilot, operations }));
    const dominantAircraft =
      [...aircraftOps.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    return {
      icao: data.icao,
      snapshot,
      rows: rows.slice(0, 400),
      currentWeek: { arrivals, departures, operations: arrivals + departures },
      confidence: confidenceOf(rows.length, pilots.size, weeksSeen.size),
      ownerImpact: {
        ownedAircraftInvolved: ownedAircraftIds.size,
        operationsGenerated,
        flightsByOtherPilots,
        revenueAttributed,
      },
      dna: { dominantAircraft, topVisitors, weekendOps, weekdayOps },
      generatedAt: new Date().toISOString(),
    };
  });

// ---------------------------------------------------------------------------
// Traffic Value Profile + Airport Revenue Intelligence — payout intelligence
// ---------------------------------------------------------------------------

export const getCommandValue = createServerFn({ method: "GET" })
  .inputValidator((d: { icao: string; username?: string; pages?: number; adminToken?: string }) => ({
    icao: (d?.icao ?? "").trim().toUpperCase(),
    username: d?.username,
    pages: Math.min(Math.max(d?.pages ?? 40, 1), 120),
    adminToken: d?.adminToken,
  }))
  .handler(async ({ data }): Promise<CommandValue> => {
    const { getAirportPayoutMatrix } = await import("./simfly.functions");
    const matrix = await getAirportPayoutMatrix({
      data: {
        icao: data.icao,
        pages: data.pages,
        ...(data.username ? { username: data.username } : {}),
        ...(data.adminToken ? { adminToken: data.adminToken } : {}),
      },
    });

    const tierAgg = new Map<number, { operations: number; pax: number }>();
    const levelAgg = new Map<number, { operations: number; pax: number }>();
    const combos: CommandCombo[] = [];
    const weekAgg = new Map<number, CommandRevenueWeek>();
    let sampledFlights = 0;

    for (const cell of matrix.cells) {
      const t = tierAgg.get(cell.tier) ?? { operations: 0, pax: 0 };
      t.operations += cell.flights;
      t.pax += cell.avgPax * cell.flights;
      tierAgg.set(cell.tier, t);

      const l = levelAgg.get(cell.level) ?? { operations: 0, pax: 0 };
      l.operations += cell.flights;
      l.pax += cell.avgPax * cell.flights;
      levelAgg.set(cell.level, l);

      combos.push({
        tier: cell.tier,
        level: cell.level,
        operations: cell.flights,
        avgPax: cell.avgPax,
      });

      for (const s of cell.samples) {
        const tsMs = Date.parse(s.ts);
        if (!Number.isFinite(tsMs)) continue;
        sampledFlights++;
        const ws = weekStartMs(tsMs);
        const entry =
          weekAgg.get(ws) ??
          {
            weekNumber: weekNumberOf(ws),
            weekStartIso: new Date(ws).toISOString(),
            operations: 0,
            basePax: 0,
            bonusPax: 0,
          };
        entry.operations += 1;
        entry.basePax += s.basePax;
        entry.bonusPax += s.bonusPax;
        weekAgg.set(ws, entry);
      }
    }

    const totalPax = [...tierAgg.values()].reduce((s, v) => s + v.pax, 0);
    const tiers: CommandTierShare[] = [...tierAgg.entries()]
      .map(([tier, v]) => ({
        tier,
        operations: v.operations,
        pax: v.pax,
        share: totalPax > 0 ? (v.pax / totalPax) * 100 : 0,
      }))
      .sort((a, b) => b.share - a.share);

    const levels: CommandLevelShare[] = [...levelAgg.entries()]
      .map(([level, v]) => ({
        level,
        operations: v.operations,
        avgPax: v.operations > 0 ? v.pax / v.operations : 0,
      }))
      .sort((a, b) => b.operations - a.operations);

    const nowWeekStart = weekStartMs(Date.now());

    return {
      icao: data.icao,
      snapshot: {
        weekStartIso: new Date(nowWeekStart).toISOString(),
        weekNumber: weekNumberOf(nowWeekStart),
      },
      tiers,
      levels,
      combos: combos.sort((a, b) => b.avgPax - a.avgPax).slice(0, 8),
      revenueWeeks: [...weekAgg.values()].sort((a, b) => a.weekNumber - b.weekNumber).slice(-16),
      sampledFlights,
      generatedAt: matrix.fetchedAt,
    };
  });

// ---------------------------------------------------------------------------
// Live arrivals board — live flight feed only
// ---------------------------------------------------------------------------

export const getCommandLive = createServerFn({ method: "GET" })
  .inputValidator((d: { icao: string; username?: string }) => ({
    icao: (d?.icao ?? "").trim().toUpperCase(),
    username: d?.username,
  }))
  .handler(async ({ data }): Promise<CommandLive> => {
    const { getMyHubsIncomingTraffic, getMyLiveFlights } = await import("./simfly.functions");

    const [hubs, mine] = await Promise.all([
      getMyHubsIncomingTraffic({
        data: { icaos: [data.icao], ...(data.username ? { username: data.username } : {}) },
      }).catch(() => []),
      getMyLiveFlights({
        data: { icaos: [data.icao], ...(data.username ? { username: data.username } : {}) },
      }).catch(() => []),
    ]);

    const inbound = new Map<string, CommandLiveInbound>();

    for (const hub of hubs) {
      if (hub.icao.toUpperCase() !== data.icao) continue;
      for (const v of hub.visitors) {
        if ((v.destination ?? "").toUpperCase() !== data.icao) continue;
        inbound.set(v.id, {
          id: v.id,
          pilot: v.username,
          aircraftName: v.aircraftName,
          aircraftICAO: v.aircraftICAO,
          tailNumber: v.tailNumber,
          origin: v.origin,
          etaMs: v.etaMs,
          distanceNm: v.distanceNm,
          isOwnPilot: false,
        });
      }
    }

    for (const f of mine) {
      if ((f.destination ?? "").toUpperCase() !== data.icao) continue;
      inbound.set(f.id, {
        id: f.id,
        pilot: f.pilotUsername ?? data.username ?? "—",
        aircraftName: f.aircraftName,
        aircraftICAO: f.aircraftICAO,
        tailNumber: f.tailNumber,
        origin: f.origin,
        etaMs: f.etaMs,
        distanceNm: f.distanceNm,
        isOwnPilot: true,
      });
    }

    return {
      icao: data.icao,
      inbound: [...inbound.values()].sort(
        (a, b) => (a.etaMs ?? Number.MAX_SAFE_INTEGER) - (b.etaMs ?? Number.MAX_SAFE_INTEGER),
      ),
      fetchedAt: new Date().toISOString(),
    };
  });

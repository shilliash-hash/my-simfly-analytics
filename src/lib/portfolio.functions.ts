// Portfolio Intelligence — orchestration layer.
//
// This is the ONLY module allowed to call multiple upstream intelligence
// server functions. It fans out with per-source timeouts + Promise.allSettled,
// hands the results to the pure engine, persists an immutable weekly snapshot,
// and returns the composed report.
//
// Hardening principles enforced here:
//   • Failure isolation: each upstream is wrapped with a timeout + a fallback
//     to `{ state: "unavailable" }`. One slow source never blocks the report.
//   • Historical integrity: snapshots are written with ON CONFLICT DO NOTHING;
//     the first write of a week wins and is never rewritten.
//   • Decision horizon: first generation records `portfolio_horizon`;
//     recommendations are only valid from that timestamp forward.

import { createServerFn } from "@tanstack/react-start";
import {
  composePortfolioReport,
  weekStartUtcIso,
  PORTFOLIO_WEIGHTS_VERSION,
  PORTFOLIO_RULE_REGISTRY_VERSION,
  type EngineInputs,
  type PortfolioReport,
  type SourceState,
} from "./portfolio-engine";

const SOURCE_TIMEOUTS_MS = {
  simfly: 20_000,      // heaviest — feeds fleet + advisor inputs
  income: 15_000,
  advisor: 20_000,
  aircraftUtil: 20_000,
  airportUtil: 20_000,
} as const;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout:${label}`)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

/**
 * Read-only: returns the persisted snapshot for the current week, or null when
 * the pilot has not run an analysis this week. Never fans out, never computes.
 */
export const getPortfolioSnapshot = createServerFn({ method: "GET" })
  .inputValidator((d?: { username?: string }) => d ?? {})
  .handler(async ({ data }): Promise<PortfolioReport | null> => {
    const { getSessionIdentity } = await import("./identity.server");
    const { username } = await getSessionIdentity({ username: data.username });

    const { hasWeeklyHubSupport } = await import("./hub-support.functions");
    if (!(await hasWeeklyHubSupport(username))) {
      throw new Error("HUB_SUPPORT_REQUIRED");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const weekIso = weekStartUtcIso();
    const { data: row } = await supabaseAdmin
      .from("portfolio_snapshot_week")
      .select(
        "week_start_utc, weights_version, rule_registry_version, composites, recommendations, degraded_sources, source_versions, created_at",
      )
      .eq("username", username)
      .eq("week_start_utc", weekIso)
      .maybeSingle();
    if (!row) return null;

    const { data: horizon } = await supabaseAdmin
      .from("portfolio_horizon")
      .select("horizon_started_at")
      .eq("username", username)
      .maybeSingle();

    const composites = (row.composites ?? []) as unknown as PortfolioReport["composites"];
    const sourceStates: Record<string, SourceState> = {};
    for (const key of Object.keys(
      (row.source_versions ?? {}) as Record<string, string>,
    )) {
      sourceStates[key] = "ok";
    }
    for (const key of row.degraded_sources ?? []) sourceStates[key] = "unavailable";

    return {
      weightsVersion: row.weights_version,
      ruleRegistryVersion: row.rule_registry_version,
      generatedAtIso: row.created_at,
      weekStartUtcIso: row.week_start_utc,
      horizonStartedAtIso: horizon?.horizon_started_at ?? row.created_at,
      isFirstGeneration: false,
      composites,
      recommendations: (row.recommendations ??
        []) as unknown as PortfolioReport["recommendations"],
      sourceStates,
      degradedSources: row.degraded_sources ?? [],
    };
  });

export const runPortfolioAnalysis = createServerFn({ method: "POST" })
  .inputValidator((d?: { username?: string }) => d ?? {})
  .handler(async ({ data }): Promise<PortfolioReport> => {
    const { getSessionIdentity } = await import("./identity.server");
    const { username } = await getSessionIdentity({ username: data.username });

    // Gate: Portfolio Intelligence is a supporter feature.
    const { hasWeeklyHubSupport } = await import("./hub-support.functions");
    if (!(await hasWeeklyHubSupport(username))) {
      throw new Error("HUB_SUPPORT_REQUIRED");
    }

    const { getSimflyPayload, getUpgradeAdvisor, getAirportUtilizationTimeline } =
      await import("./simfly.functions");
    const { getIncomeSummary } = await import("./income.functions");
    const { getAircraftUtilizationTimeline, classifyAircraft } = await import(
      "./aircraft-utilization.functions"
    );

    // Fan out. SimFly payload feeds fleet + is required to compute advisor
    // inputs, so we await it first then run the rest in parallel.
    const payloadRes = await Promise.allSettled([
      withTimeout(
        getSimflyPayload({ data: { username } }),
        SOURCE_TIMEOUTS_MS.simfly,
        "simfly",
      ),
    ]);
    const payload = payloadRes[0].status === "fulfilled" ? payloadRes[0].value : null;

    const airportsForAdvisor = (payload?.airports ?? []).map((a) => ({
      icao: a.icao,
      name: a.name,
      tier: a.category,
      level: a.level,
      percToUser: a.percToUser,
    }));

    const [incomeRes, advisorRes, aircraftUtilRes, airportUtilRes] =
      await Promise.allSettled([
        withTimeout(
          getIncomeSummary({ data: { username, range: "30d" } }),
          SOURCE_TIMEOUTS_MS.income,
          "income",
        ),
        airportsForAdvisor.length > 0
          ? withTimeout(
              getUpgradeAdvisor({
                data: { username, airports: airportsForAdvisor, windowDays: 60 },
              }),
              SOURCE_TIMEOUTS_MS.advisor,
              "advisor",
            )
          : Promise.resolve(null),
        withTimeout(
          getAircraftUtilizationTimeline({ data: { username, weeks: 8 } }),
          SOURCE_TIMEOUTS_MS.aircraftUtil,
          "aircraftUtil",
        ),
        airportsForAdvisor.length > 0
          ? withTimeout(
              getAirportUtilizationTimeline({ data: { username } }),
              SOURCE_TIMEOUTS_MS.airportUtil,
              "airportUtil",
            )
          : Promise.resolve(null),
      ]);

    // Shape upstream results into engine inputs.
    const fleet: EngineInputs["fleet"] = payload
      ? (() => {
          const owned = payload.airplanes ?? [];
          const total = owned.length;
          const ready = owned.filter(
            (a) => !a.inGroundOperation && !a.groundedUntil,
          ).length;
          return { state: "ok" as const, total, ready, sourceVersion: "simfly-payload.v1" };
        })()
      : { state: "unavailable" as const };

    // Aircraft Utilization — published metrics + published classifier.
    // Portfolio never re-derives utilization thresholds.
    const fleetUtilization: EngineInputs["fleetUtilization"] =
      aircraftUtilRes.status === "fulfilled" && aircraftUtilRes.value
        ? (() => {
            const t = aircraftUtilRes.value;
            const TRAILING = 4;
            const weeks = t.weeks.slice(-TRAILING);
            const liveById = new Map(
              (payload?.airplanes ?? []).map((a) => [
                a.aircraftId,
                { grounded: Boolean(a.inGroundOperation || a.groundedUntil), airborne: false },
              ]),
            );
            const aircraft = t.aircraft.map((info) => {
              const cells = weeks
                .map((w) => t.cells[info.aircraftId]?.[w.weekStartIso] ?? null)
                .filter((c): c is NonNullable<typeof c> => c != null);
              const opVals = cells
                .map((c) => c.operationalUtilization ?? c.flightActivity)
                .filter((v): v is number => typeof v === "number");
              const trailingOperational =
                opVals.length > 0 ? opVals.reduce((a, b) => a + b, 0) / opVals.length : null;
              const trailingFlights = cells.reduce((s, c) => s + c.flights, 0);
              return {
                aircraftId: info.aircraftId,
                label: info.tailNumber || info.name || info.aircraftId,
                cls: classifyAircraft(
                  trailingOperational,
                  trailingFlights,
                  liveById.get(info.aircraftId) ?? null,
                ),
                trailingOperational,
                trailingFlights,
              };
            });
            const fleetKeys = weeks.map((w) => w.weekStartIso);
            const fleetOpVals = fleetKeys
              .map((k) => t.fleet[k]?.fleetOperational)
              .filter((v): v is number => typeof v === "number");
            const fleetActVals = fleetKeys
              .map((k) => t.fleet[k]?.fleetFlightActivity)
              .filter((v): v is number => typeof v === "number");
            return {
              state: "ok" as const,
              trailingWeeks: weeks.length,
              fleetOperational:
                fleetOpVals.length > 0
                  ? fleetOpVals.reduce((a, b) => a + b, 0) / fleetOpVals.length
                  : null,
              fleetFlightActivity:
                fleetActVals.length > 0
                  ? fleetActVals.reduce((a, b) => a + b, 0) / fleetActVals.length
                  : null,
              aircraft,
              sourceVersion: "aircraft-utilization.v1",
            };
          })()
        : { state: "unavailable" };

    const income: EngineInputs["income"] =
      incomeRes.status === "fulfilled" && incomeRes.value
        ? {
            state: "ok",
            active30d: incomeRes.value.totals.active,
            passive30d: incomeRes.value.totals.passive,
            total30d: incomeRes.value.totals.total,
            passiveShare: incomeRes.value.kpis.passiveShare,
            concentration: incomeRes.value.kpis.concentration,
            passiveMomentum: incomeRes.value.kpis.passiveMomentum,
            topAirport: incomeRes.value.kpis.topAirport,
            ownedAirports: incomeRes.value.totals.ownedAirports,
            sourceVersion: "income.v1",
          }
        : { state: "unavailable" };

     // Airport Capacity Utilization — capacity/used (operations = arrivals +
    // departures) are read verbatim from the published timeline.
    const hubCapacity: EngineInputs["hubCapacity"] =
      airportUtilRes.status === "fulfilled" && airportUtilRes.value
        ? (() => {
            const t = airportUtilRes.value;
            const TRAILING = 6;
            // Exclude the in-progress current week: it always looks starved.
            const weeks = t.weeks.slice(-(TRAILING + 1), -1);
            const airports = t.airportMeta.map((m) => {
              const used: number[] = [];
              const caps: number[] = [];
              for (const w of weeks) {
                const cell = w.byAirport.find((b) => b.icao === m.icao);
                if (!cell) continue;
                used.push(cell.used);
                caps.push(cell.capacity);
              }
              const usedAvg =
                used.length > 0 ? used.reduce((a, b) => a + b, 0) / used.length : 0;
              const capAvg =
                caps.length > 0 ? caps.reduce((a, b) => a + b, 0) / caps.length : m.capacity;
              return {
                icao: m.icao,
                name: m.name,
                tier: m.category,
                capacity: Math.round(capAvg),
                usedAvg,
                utilization: used.length > 0 && capAvg > 0 ? usedAvg / capAvg : null,
              };
            });
            return {
              state: "ok" as const,
              weeksObserved: weeks.length,
              airports,
              sourceVersion: "airport-utilization.v2",
            };
          })()
        : { state: "unavailable" };

    const upgradeAdvisor: EngineInputs["upgradeAdvisor"] =
      advisorRes.status === "fulfilled" && advisorRes.value
        ? {
            state: "ok",
            windowDays: advisorRes.value.windowDays,
            rows: advisorRes.value.rows.map((r) => ({
              icao: r.icao,
              name: r.name,
              stars: r.stars,
              paybackDays: r.paybackDays,
              upgradeCost: r.upgradeCost,
              dailyIncrease: r.dailyIncrease,
              nextLevel: r.nextLevel,
              levelProgress: r.levelProgress ?? null,
            })),
            sourceVersion: "upgrade-advisor.v1",
          }
        : { state: "unavailable" };

    // Horizon marker — first generation ever anchors the decision horizon.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const nowIso = new Date().toISOString();
    const { data: existingHorizon } = await supabaseAdmin
      .from("portfolio_horizon")
      .select("horizon_started_at")
      .eq("username", username)
      .maybeSingle();

    let horizonStartedAtIso = existingHorizon?.horizon_started_at ?? nowIso;
    let isFirstGeneration = !existingHorizon;
    if (isFirstGeneration) {
      const { data: inserted } = await supabaseAdmin
        .from("portfolio_horizon")
        .upsert(
          {
            username,
            horizon_started_at: nowIso,
            weights_version: PORTFOLIO_WEIGHTS_VERSION,
            rule_registry_version: PORTFOLIO_RULE_REGISTRY_VERSION,
          },
          { onConflict: "username", ignoreDuplicates: true },
        )
        .select("horizon_started_at")
        .maybeSingle();
      if (inserted?.horizon_started_at) horizonStartedAtIso = inserted.horizon_started_at;
      else {
        // Another concurrent call won; re-read.
        const { data: reread } = await supabaseAdmin
          .from("portfolio_horizon")
          .select("horizon_started_at")
          .eq("username", username)
          .maybeSingle();
        if (reread?.horizon_started_at) {
          horizonStartedAtIso = reread.horizon_started_at;
          isFirstGeneration = false;
        }
      }
    }

    const weekIso = weekStartUtcIso();
    const report = composePortfolioReport({
      identity: { username },
      fleet,
      fleetUtilization,
      income,
      hubCapacity,
      upgradeAdvisor,
      horizon: { startedAtIso: horizonStartedAtIso, isFirstGeneration },
      weekStartUtcIso: weekIso,
    });

    // Weekly snapshot — only persist when no source is degraded, so history
    // never records a half-computed week. An explicit re-run overwrites the
    // current week; earlier weeks are never touched.
    if (report.degradedSources.length === 0) {
      const inputsFrozen = {
        fleet,
        fleetUtilization,
        income,
        hubCapacity,
        upgradeAdvisor,
      };
      const sourceVersions: Record<string, string> = {};
      if (fleet.state === "ok") sourceVersions.fleet = fleet.sourceVersion;
      if (fleetUtilization.state === "ok") sourceVersions.fleetUtilization = fleetUtilization.sourceVersion;
      if (income.state === "ok") sourceVersions.income = income.sourceVersion;
      if (hubCapacity.state === "ok") sourceVersions.hubCapacity = hubCapacity.sourceVersion;
      if (upgradeAdvisor.state === "ok") sourceVersions.upgradeAdvisor = upgradeAdvisor.sourceVersion;

      await supabaseAdmin
        .from("portfolio_snapshot_week")
        .upsert(
          {
            username,
            week_start_utc: weekIso,
            weights_version: PORTFOLIO_WEIGHTS_VERSION,
            rule_registry_version: PORTFOLIO_RULE_REGISTRY_VERSION,
            composites: report.composites as never,
            recommendations: report.recommendations as never,
            inputs_frozen: inputsFrozen as never,
            source_versions: sourceVersions,
            degraded_sources: report.degradedSources,
            created_at: report.generatedAtIso,
          },
          { onConflict: "username,week_start_utc" },
        );
    }

    return report;
  });

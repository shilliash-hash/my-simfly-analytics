// Portfolio Intelligence — pure engine.
//
// Zero SQL, zero HTTP, zero imports from source intelligence modules.
// Receives already-fetched inputs, composes them into higher-order artifacts
// (composites + recommendations), and returns a serializable report.
//
// See mem://index.md and the v4 hardening plan:
//   1. Portfolio owns no analytical truth — it composes truth owned by others.
//   2. Historical values are evidence; current state is authoritative.
//   3. All recommendations are explainable — every one carries a source graph.
//
// NON-DUPLICATION CONTRACT (binding):
//   Portfolio never re-derives business logic that already exists upstream.
//   Aircraft classes, utilization percentages, capacity/used counts,
//   active/passive splits, ROI/payback and upgrade progress are all read
//   verbatim from the modules that own them. The only logic this file owns is
//   composition: normalising published values into 0..100 composite scores,
//   banding them, and evaluating rules over them.

export const PORTFOLIO_WEIGHTS_VERSION = "2.0.0";
export const PORTFOLIO_RULE_REGISTRY_VERSION = "2.0.0";

/** One number pulled verbatim from an upstream intelligence module. */
export type MetricContribution = {
  id: string;                 // namespaced: "advisor.top_payback_days.v1"
  sourceModule: string;       // "upgrade-advisor" | "income" | "simfly" | ...
  sourceVersion: string;      // opaque, upstream-owned
  value: number | null;
  label: string;
  unit?: string;
  /** Free-form evidence pointer — ICAO, aircraftId, etc. */
  ref?: Record<string, string | number | undefined>;
  /** true when the value pre-dates the pilot's decision horizon. */
  preHorizon?: boolean;
};

export type SourceState = "ok" | "degraded" | "unavailable";

export type CompositeScore = {
  id: string;
  label: string;
  score: number | null;        // 0..100 or null when inputs missing
  band: "strong" | "healthy" | "watch" | "weak" | "unknown";
  state: SourceState;
  contributions: MetricContribution[];
  explanation: string;
};

export type RecommendationTier = "immediate" | "planned" | "consider";

export type Recommendation = {
  id: string;
  ruleId: string;
  tier: RecommendationTier;
  priority: number;                    // higher = more urgent
  title: string;
  detail: string;
  actionLabel: string;
  actionRoute: string;                 // deep-link into the source module
  evidence: MetricContribution[];
  requires: string[];                  // upstream metric IDs consulted
};

export type PortfolioReport = {
  weightsVersion: string;
  ruleRegistryVersion: string;
  generatedAtIso: string;
  weekStartUtcIso: string;
  horizonStartedAtIso: string;
  isFirstGeneration: boolean;
  composites: CompositeScore[];
  recommendations: Recommendation[];
  sourceStates: Record<string, SourceState>;
  degradedSources: string[];
};

// ---------------------------------------------------------------------------
// Input shape (verbatim slices of upstream module outputs).
// The orchestrator hands us these; the engine never fetches.
// ---------------------------------------------------------------------------

/** Aircraft class published by aircraft-utilization.functions.ts. */
export type PublishedAircraftClass =
  | "WORKHORSE" | "ACTIVE" | "UNDERUSED" | "IDLE"
  | "GROUNDED" | "AIRBORNE" | "UNKNOWN";

export type EngineInputs = {
  identity: { username: string };
  fleet:
    | { state: "ok"; total: number; ready: number; sourceVersion: string }
    | { state: "degraded" | "unavailable" };
  /** Published output of the Aircraft Utilization module. */
  fleetUtilization:
    | {
        state: "ok";
        trailingWeeks: number;
        /** Fleet Operational Utilization mean over the trailing window (0..1). */
        fleetOperational: number | null;
        /** Fleet Flight Activity mean over the trailing window (0..1). */
        fleetFlightActivity: number | null;
        aircraft: {
          aircraftId: string;
          label: string;
          /** Class as published by classifyAircraft — never re-derived here. */
          cls: PublishedAircraftClass;
          trailingOperational: number | null;
          trailingFlights: number;
        }[];
        sourceVersion: string;
      }
    | { state: "degraded" | "unavailable" };
  income:
    | {
        state: "ok";
        active30d: number;
        passive30d: number;
        total30d: number;
        passiveShare: number;
        /** HHI concentration of passive income (0..1). */
        concentration: number;
        passiveMomentum: number | null;
        topAirport: { icao: string; pax: number } | null;
        ownedAirports: number;
        sourceVersion: string;
      }
    | { state: "degraded" | "unavailable" };
  /** Published output of the Airport Capacity Utilization module. */
  hubCapacity:
    | {
        state: "ok";
        weeksObserved: number;
        airports: {
          icao: string;
          name: string;
          capacity: number;
          usedAvg: number;
          /** usedAvg / capacity as published by the timeline (0..n). */
          utilization: number | null;
        }[];
        sourceVersion: string;
      }
    | { state: "degraded" | "unavailable" };
  upgradeAdvisor:
    | {
        state: "ok";
        windowDays: number;
        rows: {
          icao: string;
          name: string;
          stars: 1 | 2 | 3 | 4 | 5;
          paybackDays: number;
          upgradeCost: number;
          dailyIncrease: number;
          nextLevel: number;
          /** Published upgrade progress (percent toward next level). */
          levelProgress?: number | null;
        }[];
        sourceVersion: string;
      }
    | { state: "degraded" | "unavailable" };
  horizon: { startedAtIso: string; isFirstGeneration: boolean };
  weekStartUtcIso: string;
};

// ---------------------------------------------------------------------------
// Composites
// ---------------------------------------------------------------------------

function bandForScore(score: number | null): CompositeScore["band"] {
  if (score == null) return "unknown";
  if (score >= 85) return "strong";
  if (score >= 65) return "healthy";
  if (score >= 40) return "watch";
  return "weak";
}

function pct(n: number): number {
  return Math.round(n * 1000) / 10;
}

function composeAssetHealth(inputs: EngineInputs): CompositeScore {
  if (inputs.fleet.state !== "ok") {
    return {
      id: "asset-health",
      label: "Asset Health",
      score: null,
      band: "unknown",
      state: inputs.fleet.state,
      contributions: [],
      explanation: "Fleet readiness signal is temporarily unavailable.",
    };
  }
  const { ready, total, sourceVersion } = inputs.fleet;
  const readinessScore = total > 0 ? (ready / total) * 100 : null;

  const contributions: MetricContribution[] = [
    {
      id: "ready-status.ready_aircraft.v1",
      sourceModule: "ready-status",
      sourceVersion,
      value: ready,
      label: "Ready aircraft",
      unit: "count",
    },
    {
      id: "ready-status.owned_aircraft.v1",
      sourceModule: "ready-status",
      sourceVersion,
      value: total,
      label: "Owned aircraft",
      unit: "count",
    },
  ];

  const util = inputs.fleetUtilization;
  let score = readinessScore == null ? null : Math.round(readinessScore);
  let explanation =
    total > 0
      ? `${ready} of ${total} owned aircraft are ready to depart right now.`
      : "No owned aircraft yet — Asset Health will activate once you own at least one aircraft.";

  if (util.state === "ok" && total > 0) {
    // Utilization scale published by the Aircraft Utilization module: its
    // WORKHORSE threshold (0.30 operational) is the top of the useful band, so
    // 30%+ operational utilization maps to a full utilization sub-score.
    const opRaw = util.fleetOperational ?? util.fleetFlightActivity;
    if (opRaw != null) {
      const utilScore = Math.max(0, Math.min(100, (opRaw / 0.3) * 100));
      score = Math.round((readinessScore ?? 0) * 0.5 + utilScore * 0.5);
      const idle = util.aircraft.filter((a) => a.cls === "IDLE").length;
      const workhorses = util.aircraft.filter((a) => a.cls === "WORKHORSE").length;
      explanation =
        `${ready} of ${total} aircraft ready to depart. Fleet operational utilization ` +
        `over the last ${util.trailingWeeks} weeks: ${pct(opRaw)}%` +
        (workhorses > 0 ? ` · ${workhorses} workhorse${workhorses === 1 ? "" : "s"}` : "") +
        (idle > 0 ? ` · ${idle} idle tail${idle === 1 ? "" : "s"}` : "") +
        ".";
      contributions.push(
        {
          id: "aircraft-utilization.fleet_operational.v1",
          sourceModule: "aircraft-utilization",
          sourceVersion: util.sourceVersion,
          value: pct(opRaw),
          label: `Fleet operational utilization (${util.trailingWeeks}w)`,
          unit: "%",
        },
        {
          id: "aircraft-utilization.idle_aircraft.v1",
          sourceModule: "aircraft-utilization",
          sourceVersion: util.sourceVersion,
          value: idle,
          label: "Idle aircraft",
          unit: "count",
        },
      );
    }
  }

  return {
    id: "asset-health",
    label: "Asset Health",
    score,
    band: bandForScore(score),
    state: "ok",
    contributions,
    explanation,
  };
}

function composeIncomeHealth(inputs: EngineInputs): CompositeScore {
  const income = inputs.income;
  if (income.state !== "ok") {
    return {
      id: "income-health",
      label: "Income Health",
      score: null,
      band: "unknown",
      state: income.state,
      contributions: [],
      explanation: "Income Intelligence is temporarily unavailable.",
    };
  }

  // Composition only: passive share (target 40%), diversification (1 - HHI),
  // and momentum (30d vs previous 30d) all arrive published by Income.
  const shareScore = Math.max(0, Math.min(100, (income.passiveShare / 0.4) * 100));
  const diversificationScore = Math.max(0, Math.min(100, (1 - income.concentration) * 100));
  const momentumScore =
    income.passiveMomentum == null
      ? null
      : Math.max(0, Math.min(100, income.passiveMomentum * 60));

  const parts: number[] = [shareScore * 0.4, diversificationScore * 0.4];
  parts.push((momentumScore ?? 60) * 0.2);
  const score = income.total30d > 0 ? Math.round(parts.reduce((a, b) => a + b, 0)) : null;

  const contributions: MetricContribution[] = [
    {
      id: "income.total_30d.v1",
      sourceModule: "income",
      sourceVersion: income.sourceVersion,
      value: Math.round(income.total30d),
      label: "Total income (30d)",
      unit: "PAX",
    },
    {
      id: "income.passive_30d.v1",
      sourceModule: "income",
      sourceVersion: income.sourceVersion,
      value: Math.round(income.passive30d),
      label: "Passive income (30d)",
      unit: "PAX",
    },
    {
      id: "income.passive_share.v1",
      sourceModule: "income",
      sourceVersion: income.sourceVersion,
      value: pct(income.passiveShare),
      label: "Passive share",
      unit: "%",
    },
    {
      id: "income.concentration.v1",
      sourceModule: "income",
      sourceVersion: income.sourceVersion,
      value: Math.round(income.concentration * 1000) / 1000,
      label: "Passive concentration (HHI)",
    },
  ];
  if (income.passiveMomentum != null) {
    contributions.push({
      id: "income.passive_momentum.v1",
      sourceModule: "income",
      sourceVersion: income.sourceVersion,
      value: Math.round(income.passiveMomentum * 100) / 100,
      label: "Passive momentum (30d vs prior 30d)",
      unit: "x",
    });
  }

  return {
    id: "income-health",
    label: "Income Health",
    score,
    band: bandForScore(score),
    state: "ok",
    contributions,
    explanation:
      income.total30d > 0
        ? `${pct(income.passiveShare)}% of the last 30 days came from assets rather than flying, spread across ${income.ownedAirports} owned airport${income.ownedAirports === 1 ? "" : "s"}.`
        : "No income recorded in the last 30 days — Income Health activates with your next flights.",
  };
}

function composeHubCapacityHealth(inputs: EngineInputs): CompositeScore {
  const cap = inputs.hubCapacity;
  if (cap.state !== "ok") {
    return {
      id: "hub-capacity-health",
      label: "Hub Capacity Health",
      score: null,
      band: "unknown",
      state: cap.state,
      contributions: [],
      explanation: "Airport capacity utilization is temporarily unavailable.",
    };
  }
  const rated = cap.airports.filter((a) => a.utilization != null);
  if (rated.length === 0) {
    return {
      id: "hub-capacity-health",
      label: "Hub Capacity Health",
      score: null,
      band: "unknown",
      state: "ok",
      contributions: [],
      explanation:
        "No owned airport has enough observed weeks yet to rate capacity utilization.",
    };
  }
  // Composition only: the timeline publishes used/capacity per airport-week.
  // A healthy hub sits near — but not above — its weekly capacity.
  const mean =
    rated.reduce((s, a) => s + (a.utilization as number), 0) / rated.length;
  const score = Math.round(Math.max(0, Math.min(100, mean * 100)));
  const saturated = rated.filter((a) => (a.utilization as number) >= 0.95).length;
  const starved = rated.filter((a) => (a.utilization as number) < 0.3).length;

  const top = [...rated].sort(
    (a, b) => (b.utilization as number) - (a.utilization as number),
  )[0];

  const contributions: MetricContribution[] = [
    {
      id: "airport-utilization.mean_utilization.v1",
      sourceModule: "airport-utilization",
      sourceVersion: cap.sourceVersion,
      value: pct(mean),
      label: `Mean capacity utilization (${cap.weeksObserved}w)`,
      unit: "%",
    },
    {
      id: "airport-utilization.saturated_airports.v1",
      sourceModule: "airport-utilization",
      sourceVersion: cap.sourceVersion,
      value: saturated,
      label: "Airports at/over capacity",
      unit: "count",
    },
    {
      id: "airport-utilization.starved_airports.v1",
      sourceModule: "airport-utilization",
      sourceVersion: cap.sourceVersion,
      value: starved,
      label: "Airports under 30% capacity",
      unit: "count",
    },
  ];
  if (top) {
    contributions.push({
      id: "airport-utilization.top_airport_utilization.v1",
      sourceModule: "airport-utilization",
      sourceVersion: cap.sourceVersion,
      value: pct(top.utilization as number),
      label: `Busiest hub (${top.icao})`,
      unit: "%",
      ref: { icao: top.icao },
    });
  }

  return {
    id: "hub-capacity-health",
    label: "Hub Capacity Health",
    score,
    band: bandForScore(score),
    state: "ok",
    contributions,
    explanation:
      `Owned airports fill ${pct(mean)}% of their weekly capacity on average over the last ${cap.weeksObserved} weeks` +
      (saturated > 0
        ? ` — ${saturated} hub${saturated === 1 ? " is" : "s are"} at or over capacity and losing traffic.`
        : starved > 0
        ? ` — ${starved} hub${starved === 1 ? " is" : "s are"} well below the capacity you already pay for.`
        : "."),
  };
}

// ---------------------------------------------------------------------------
// Rule pack — adding rules is additive: append to the list, declare
// `requires`, return zero or more recommendations.
// ---------------------------------------------------------------------------

type Rule = {
  id: string;
  requires: string[];
  evaluate: (inputs: EngineInputs) => Recommendation[];
};

const upgradePriorityRule: Rule = {
  id: "upgrade-priority",
  requires: ["upgrade-advisor.rows.v1"],
  evaluate: (inputs) => {
    if (inputs.upgradeAdvisor.state !== "ok") return [];
    const eligible = inputs.upgradeAdvisor.rows
      .filter((r) => r.paybackDays > 0 && r.paybackDays <= 240)
      .sort((a, b) => a.paybackDays - b.paybackDays);
    const top = eligible[0];
    if (!top) return [];
    const tier: RecommendationTier =
      top.paybackDays <= 30
        ? "immediate"
        : top.paybackDays <= 90
        ? "planned"
        : "consider";
    const priority = Math.max(1, Math.round(1000 / top.paybackDays));
    const evidence: MetricContribution[] = [
      {
        id: "upgrade-advisor.payback_days.v1",
        sourceModule: "upgrade-advisor",
        sourceVersion: inputs.upgradeAdvisor.sourceVersion,
        value: top.paybackDays,
        label: "Payback days (current)",
        unit: "days",
        ref: { icao: top.icao, nextLevel: top.nextLevel },
      },
      {
        id: "upgrade-advisor.upgrade_cost.v1",
        sourceModule: "upgrade-advisor",
        sourceVersion: inputs.upgradeAdvisor.sourceVersion,
        value: top.upgradeCost,
        label: "Upgrade cost",
        unit: "PAX",
        ref: { icao: top.icao, nextLevel: top.nextLevel },
      },
      {
        id: "upgrade-advisor.daily_increase.v1",
        sourceModule: "upgrade-advisor",
        sourceVersion: inputs.upgradeAdvisor.sourceVersion,
        value: top.dailyIncrease,
        label: "Projected daily PAX gain",
        unit: "PAX/day",
        ref: { icao: top.icao },
      },
    ];
    if (top.levelProgress != null) {
      evidence.push({
        id: "upgrade-advisor.level_progress.v1",
        sourceModule: "upgrade-advisor",
        sourceVersion: inputs.upgradeAdvisor.sourceVersion,
        value: Math.round(top.levelProgress * 10) / 10,
        label: "Progress toward next level",
        unit: "%",
        ref: { icao: top.icao },
      });
    }
    return [
      {
        id: `upgrade-priority:${top.icao}`,
        ruleId: "upgrade-priority",
        tier,
        priority,
        title: `Upgrade ${top.icao} to L${top.nextLevel}`,
        detail:
          `Payback in ~${Math.round(top.paybackDays)} days at current arrivals. Advisor rating: ${"★".repeat(top.stars)}${"☆".repeat(5 - top.stars)}.` +
          (top.levelProgress != null
            ? ` Upgrade progress: ${Math.round(top.levelProgress)}%.`
            : ""),
        actionLabel: "Open Upgrade Advisor",
        actionRoute: "/upgrade-advisor",
        evidence,
        requires: ["upgrade-advisor.rows.v1"],
      },
    ];
  },
};

const idleAssetRule: Rule = {
  id: "idle-asset",
  requires: ["aircraft-utilization.classes.v1"],
  evaluate: (inputs) => {
    const util = inputs.fleetUtilization;
    if (util.state !== "ok") return [];
    const idle = util.aircraft.filter((a) => a.cls === "IDLE");
    if (idle.length === 0) return [];
    const sample = idle.slice(0, 3).map((a) => a.label).join(", ");
    return [
      {
        id: "idle-asset",
        ruleId: "idle-asset",
        tier: idle.length >= 3 ? "planned" : "consider",
        priority: 40 + idle.length,
        title: `${idle.length} aircraft sitting idle`,
        detail:
          `Aircraft Utilization classes ${sample}${idle.length > 3 ? ` and ${idle.length - 3} more` : ""} as IDLE over the last ${util.trailingWeeks} weeks. Reposition, rent out, or sell — idle tails still occupy capital.`,
        actionLabel: "Open Aircraft",
        actionRoute: "/aircraft",
        evidence: idle.slice(0, 5).map((a) => ({
          id: `aircraft-utilization.class.${a.aircraftId}.v1`,
          sourceModule: "aircraft-utilization",
          sourceVersion: util.sourceVersion,
          value: a.trailingFlights,
          label: `${a.label} — flights (${util.trailingWeeks}w)`,
          unit: "flights",
          ref: { aircraftId: a.aircraftId, cls: a.cls },
        })),
        requires: ["aircraft-utilization.classes.v1"],
      },
    ];
  },
};

const capacitySaturationRule: Rule = {
  id: "capacity-saturation",
  requires: ["airport-utilization.weeks.v1"],
  evaluate: (inputs) => {
    const cap = inputs.hubCapacity;
    if (cap.state !== "ok") return [];
    const saturated = cap.airports
      .filter((a) => a.utilization != null && (a.utilization as number) >= 0.95)
      .sort((a, b) => (b.utilization as number) - (a.utilization as number));
    const top = saturated[0];
    if (!top) return [];
    return [
      {
        id: `capacity-saturation:${top.icao}`,
        ruleId: "capacity-saturation",
        tier: "immediate",
        priority: 200,
        title: `${top.icao} is running at capacity`,
        detail:
          `${top.name} averaged ${pct(top.utilization as number)}% of its ${top.capacity} weekly slots over the last ${cap.weeksObserved} weeks. Traffic above the cap is lost — a level upgrade converts it directly into income.`,
        actionLabel: "Open Upgrade Advisor",
        actionRoute: "/upgrade-advisor",
        evidence: [
          {
            id: "airport-utilization.utilization.v1",
            sourceModule: "airport-utilization",
            sourceVersion: cap.sourceVersion,
            value: pct(top.utilization as number),
            label: `${top.icao} capacity utilization`,
            unit: "%",
            ref: { icao: top.icao },
          },
          {
            id: "airport-utilization.capacity.v1",
            sourceModule: "airport-utilization",
            sourceVersion: cap.sourceVersion,
            value: top.capacity,
            label: "Weekly capacity",
            unit: "slots",
            ref: { icao: top.icao },
          },
          {
            id: "airport-utilization.used_avg.v1",
            sourceModule: "airport-utilization",
            sourceVersion: cap.sourceVersion,
            value: Math.round(top.usedAvg * 10) / 10,
            label: "Average weekly arrivals",
            unit: "arrivals",
            ref: { icao: top.icao },
          },
        ],
        requires: ["airport-utilization.weeks.v1"],
      },
    ];
  },
};

const incomeConcentrationRule: Rule = {
  id: "income-concentration",
  requires: ["income.concentration.v1"],
  evaluate: (inputs) => {
    const income = inputs.income;
    if (income.state !== "ok") return [];
    if (income.passive30d <= 0 || income.concentration < 0.5) return [];
    if (income.ownedAirports < 2) return [];
    const top = income.topAirport;
    return [
      {
        id: "income-concentration",
        ruleId: "income-concentration",
        tier: "consider",
        priority: 30,
        title: "Passive income is concentrated",
        detail:
          `Income Intelligence reports an HHI of ${Math.round(income.concentration * 100) / 100}` +
          (top ? `, driven mostly by ${top.icao}` : "") +
          ". A single hub carrying your passive income makes the portfolio fragile to traffic shifts.",
        actionLabel: "Open Income Intelligence",
        actionRoute: "/income",
        evidence: [
          {
            id: "income.concentration.v1",
            sourceModule: "income",
            sourceVersion: income.sourceVersion,
            value: Math.round(income.concentration * 1000) / 1000,
            label: "Passive concentration (HHI)",
          },
          ...(top
            ? [
                {
                  id: "income.top_airport_pax.v1",
                  sourceModule: "income",
                  sourceVersion: income.sourceVersion,
                  value: Math.round(top.pax),
                  label: `${top.icao} passive income`,
                  unit: "PAX",
                  ref: { icao: top.icao },
                } satisfies MetricContribution,
              ]
            : []),
        ],
        requires: ["income.concentration.v1"],
      },
    ];
  },
};

const passiveShareLowRule: Rule = {
  id: "passive-share-low",
  requires: ["income.passive_share.v1"],
  evaluate: (inputs) => {
    const income = inputs.income;
    if (income.state !== "ok") return [];
    if (income.total30d <= 0) return [];
    if (income.passiveShare >= 0.15) return [];
    return [
      {
        id: "passive-share-low",
        ruleId: "passive-share-low",
        tier: "planned",
        priority: 60,
        title: "Almost all income still comes from flying",
        detail:
          `Only ${pct(income.passiveShare)}% of the last 30 days was passive across ${income.ownedAirports} owned airport${income.ownedAirports === 1 ? "" : "s"}. Asset income compounds while you are offline — growing it reduces how much you must fly to earn the same amount.`,
        actionLabel: "Open Income Intelligence",
        actionRoute: "/income",
        evidence: [
          {
            id: "income.passive_share.v1",
            sourceModule: "income",
            sourceVersion: income.sourceVersion,
            value: pct(income.passiveShare),
            label: "Passive share (30d)",
            unit: "%",
          },
          {
            id: "income.active_30d.v1",
            sourceModule: "income",
            sourceVersion: income.sourceVersion,
            value: Math.round(income.active30d),
            label: "Active income (30d)",
            unit: "PAX",
          },
        ],
        requires: ["income.passive_share.v1"],
      },
    ];
  },
};

const RULE_REGISTRY: Rule[] = [
  upgradePriorityRule,
  capacitySaturationRule,
  passiveShareLowRule,
  idleAssetRule,
  incomeConcentrationRule,
];

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function composePortfolioReport(inputs: EngineInputs): PortfolioReport {
  const composites: CompositeScore[] = [
    composeAssetHealth(inputs),
    composeIncomeHealth(inputs),
    composeHubCapacityHealth(inputs),
  ];

  const recommendations: Recommendation[] = [];
  for (const rule of RULE_REGISTRY) {
    recommendations.push(...rule.evaluate(inputs));
  }
  recommendations.sort((a, b) => b.priority - a.priority);

  const sourceStates: Record<string, SourceState> = {
    fleet: inputs.fleet.state,
    fleetUtilization: inputs.fleetUtilization.state,
    income: inputs.income.state,
    hubCapacity: inputs.hubCapacity.state,
    upgradeAdvisor: inputs.upgradeAdvisor.state,
  };
  const degradedSources = Object.entries(sourceStates)
    .filter(([, s]) => s !== "ok")
    .map(([k]) => k);

  return {
    weightsVersion: PORTFOLIO_WEIGHTS_VERSION,
    ruleRegistryVersion: PORTFOLIO_RULE_REGISTRY_VERSION,
    generatedAtIso: new Date().toISOString(),
    weekStartUtcIso: inputs.weekStartUtcIso,
    horizonStartedAtIso: inputs.horizon.startedAtIso,
    isFirstGeneration: inputs.horizon.isFirstGeneration,
    composites,
    recommendations,
    sourceStates,
    degradedSources,
  };
}

/** Monday 00:00 UTC of the given moment. */
export function weekStartUtcIso(nowMs: number = Date.now()): string {
  const d = new Date(nowMs);
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const offset = (day + 6) % 7; // days since Monday
  const monday = new Date(Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate() - offset,
    0, 0, 0, 0,
  ));
  return monday.toISOString();
}

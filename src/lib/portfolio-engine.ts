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

export const PORTFOLIO_WEIGHTS_VERSION = "2.1.0";
export const PORTFOLIO_RULE_REGISTRY_VERSION = "2.1.0";

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
  score: number | null;        // domain-specific scale — see scaleLabel
  band: "strong" | "healthy" | "watch" | "weak" | "unknown";
  /** What the score number actually measures, in domain language. */
  scaleLabel: string;
  /** Domain wording for the band ("Active utilization", "Typical traffic"). */
  bandLabel: string;
  /** Unit suffix rendered next to the score, if any. */
  scoreUnit?: string;
  /** Structured explainer so no score is a mystery. */
  rationale: { measured: string; good: string; why: string };
  state: SourceState;
  contributions: MetricContribution[];
  explanation: string;
  /**
   * Optional presentation payload: per-item published values the UI can render
   * directly (e.g. airport capacity bars). No analytics — verbatim upstream
   * numbers, carried so the UI never recomputes anything.
   */
  breakdown?: {
    key: string;
    label: string;
    sublabel?: string;
    used: number;
    capacity: number;
    ratio: number;
  }[];
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
          /** Rating as published by rateAircraftUtilization — never re-derived here. */
          cls: PublishedAircraftClass;
          /** Live availability, published separately from the rating. */
          availability?: "AIRBORNE" | "GROUNDED" | "READY";
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
          /** Airport tier (category) as published by the airport module. */
          tier: number;
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

function pct(n: number): number {
  return Math.round(n * 1000) / 10;
}

/**
 * Thresholds mirrored from the Aircraft Utilization module's published
 * UTIL_THRESHOLDS_V1. Portfolio does not invent its own utilization scale —
 * these are the same cut points the owning module publishes.
 */
const UTIL_SCALE = { workhorse: 0.3, active: 0.1, underused: 0.02 } as const;

function unavailableComposite(
  id: string,
  label: string,
  scaleLabel: string,
  state: SourceState,
  measured: string,
  reason: string,
): CompositeScore {
  return {
    id,
    label,
    score: null,
    band: "unknown",
    scaleLabel,
    bandLabel: "Not available",
    rationale: {
      measured,
      good: "—",
      why: reason,
    },
    state,
    contributions: [],
    explanation: reason,
  };
}

// --- Aircraft Health -------------------------------------------------------
// Domain scale: fleet Operational Utilization, banded on the published
// WORKHORSE / ACTIVE / UNDERUSED thresholds. Readiness is supporting evidence.

function composeAssetHealth(inputs: EngineInputs): CompositeScore {
  const util = inputs.fleetUtilization;
  const fleet = inputs.fleet;

  if (util.state !== "ok" && fleet.state !== "ok") {
    return unavailableComposite(
      "asset-health",
      "Aircraft Health",
      "Fleet operational utilization",
      util.state,
      "Share of available aircraft-time actually spent flying, averaged across the fleet.",
      "Aircraft Intelligence is temporarily unavailable, so no fleet score is shown.",
    );
  }

  const contributions: MetricContribution[] = [];
  if (fleet.state === "ok") {
    contributions.push(
      {
        id: "ready-status.ready_aircraft.v1",
        sourceModule: "ready-status",
        sourceVersion: fleet.sourceVersion,
        value: fleet.ready,
        label: "Ready to depart now",
        unit: "count",
      },
      {
        id: "ready-status.owned_aircraft.v1",
        sourceModule: "ready-status",
        sourceVersion: fleet.sourceVersion,
        value: fleet.total,
        label: "Owned aircraft",
        unit: "count",
      },
    );
  }

  // Utilization-led path.
  if (util.state === "ok") {
    const opRaw = util.fleetOperational ?? util.fleetFlightActivity;
    const idle = util.aircraft.filter((a) => a.cls === "IDLE").length;
    const workhorses = util.aircraft.filter((a) => a.cls === "WORKHORSE").length;
    const active = util.aircraft.filter((a) => a.cls === "ACTIVE").length;

    if (opRaw != null) {
      const band: CompositeScore["band"] =
        opRaw >= UTIL_SCALE.workhorse
          ? "strong"
          : opRaw >= UTIL_SCALE.active
          ? "healthy"
          : opRaw >= UTIL_SCALE.underused
          ? "watch"
          : "weak";
      const bandLabel =
        band === "strong"
          ? "Workhorse utilization"
          : band === "healthy"
          ? "Active utilization"
          : band === "watch"
          ? "Underused fleet"
          : "Idle fleet";

      contributions.unshift({
        id: "aircraft-utilization.fleet_operational.v1",
        sourceModule: "aircraft-utilization",
        sourceVersion: util.sourceVersion,
        value: pct(opRaw),
        label: `Fleet operational utilization (${util.trailingWeeks}w)`,
        unit: "%",
      });
      contributions.push(
        {
          id: "aircraft-utilization.workhorse_aircraft.v1",
          sourceModule: "aircraft-utilization",
          sourceVersion: util.sourceVersion,
          value: workhorses,
          label: "Workhorse tails",
          unit: "count",
        },
        {
          id: "aircraft-utilization.idle_aircraft.v1",
          sourceModule: "aircraft-utilization",
          sourceVersion: util.sourceVersion,
          value: idle,
          label: "Idle tails (supporting)",
          unit: "count",
        },
      );

      return {
        id: "asset-health",
        label: "Aircraft Health",
        score: pct(opRaw),
        scoreUnit: "%",
        band,
        scaleLabel: `Fleet operational utilization · ${util.trailingWeeks}w`,
        bandLabel,
        rationale: {
          measured:
            "Operational utilization — the share of available aircraft-time (excluding cooldowns and grounding) that your fleet actually spent flying, averaged over the trailing window.",
          good: `${pct(UTIL_SCALE.active)}%+ is an Active fleet and ${pct(UTIL_SCALE.workhorse)}%+ is Workhorse territory. Large aircraft naturally land lower: longer flights and much longer cooldowns cap what any owner can reach, so ~12% is a genuinely well-run fleet, not a shortfall.`,
          why: `Your fleet averaged ${pct(opRaw)}% over the last ${util.trailingWeeks} weeks, which sits in the ${bandLabel} band${workhorses > 0 ? ` — carried by ${workhorses} workhorse tail${workhorses === 1 ? "" : "s"}` : ""}${active > 0 ? ` and ${active} active tail${active === 1 ? "" : "s"}` : ""}.`,
        },
        state: "ok",
        contributions,
        explanation: `This fleet is operating at a ${bandLabel.replace(" utilization", "").replace(" fleet", "")} utilization level — ${pct(opRaw)}% operational utilization over ${util.trailingWeeks} weeks${idle > 0 ? `, with ${idle} idle tail${idle === 1 ? "" : "s"} as supporting detail` : ""}.`,
      };
    }
  }

  // Readiness-only fallback: utilization has no usable window yet.
  const total = fleet.state === "ok" ? fleet.total : 0;
  const ready = fleet.state === "ok" ? fleet.ready : 0;
  const readiness = total > 0 ? Math.round((ready / total) * 100) : null;
  return {
    id: "asset-health",
    label: "Aircraft Health",
    score: readiness,
    scoreUnit: "%",
    band:
      readiness == null
        ? "unknown"
        : readiness >= 80
        ? "healthy"
        : readiness >= 40
        ? "watch"
        : "weak",
    scaleLabel: "Live readiness (no utilization window yet)",
    bandLabel: readiness == null ? "No fleet" : "Readiness only",
    rationale: {
      measured:
        "Share of owned aircraft available to depart right now. Utilization history is not deep enough yet to score fleet quality.",
      good: "Readiness naturally dips while aircraft are on cooldown; it is a snapshot, not a performance measure.",
      why:
        total > 0
          ? `${ready} of ${total} owned aircraft are ready to depart at this moment.`
          : "You do not own any aircraft yet.",
    },
    state: "ok",
    contributions,
    explanation:
      total > 0
        ? `${ready} of ${total} owned aircraft are ready to depart right now. Fly a few more weeks and this card switches to operational utilization.`
        : "No owned aircraft yet — Aircraft Health activates once you own at least one aircraft.",
  };
}

// --- Income Health ---------------------------------------------------------
// Domain scale: diversification and passive stability, not raw earnings.

function composeIncomeHealth(inputs: EngineInputs): CompositeScore {
  const income = inputs.income;
  if (income.state !== "ok") {
    return unavailableComposite(
      "income-health",
      "Income Health",
      "Diversification & passive stability",
      income.state,
      "How much of your income keeps arriving when you are not flying, and how widely it is spread.",
      "Income Intelligence is temporarily unavailable.",
    );
  }

  const shareScore = Math.max(0, Math.min(100, (income.passiveShare / 0.4) * 100));
  const diversificationScore = Math.max(0, Math.min(100, (1 - income.concentration) * 100));
  const momentumScore =
    income.passiveMomentum == null
      ? null
      : Math.max(0, Math.min(100, income.passiveMomentum * 60));

  const score =
    income.total30d > 0
      ? Math.round(shareScore * 0.4 + diversificationScore * 0.4 + (momentumScore ?? 60) * 0.2)
      : null;

  const band: CompositeScore["band"] =
    score == null
      ? "unknown"
      : score >= 75
      ? "strong"
      : score >= 55
      ? "healthy"
      : score >= 35
      ? "watch"
      : "weak";
  const bandLabel =
    band === "strong"
      ? "Diversified & self-sustaining"
      : band === "healthy"
      ? "Stable mix"
      : band === "watch"
      ? "Flying-dependent"
      : band === "weak"
      ? "Concentrated / flying-only"
      : "No income yet";

  const contributions: MetricContribution[] = [
    {
      id: "income.passive_share.v1",
      sourceModule: "income",
      sourceVersion: income.sourceVersion,
      value: pct(income.passiveShare),
      label: "Passive share (30d)",
      unit: "%",
    },
    {
      id: "income.concentration.v1",
      sourceModule: "income",
      sourceVersion: income.sourceVersion,
      value: Math.round(income.concentration * 1000) / 1000,
      label: "Passive concentration (HHI)",
    },
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
    band,
    scaleLabel: "Diversification & passive stability index",
    bandLabel,
    rationale: {
      measured:
        "Three published Income Intelligence values combined: passive share of the last 30 days (40%), how evenly that passive income is spread across hubs (40%), and its momentum against the prior 30 days (20%).",
      good: "A 40% passive share with income spread across several hubs and flat-or-rising momentum reads as fully healthy. Below roughly 35 means the portfolio only earns while you personally fly.",
      why:
        income.total30d > 0
          ? `Passive share is ${pct(income.passiveShare)}%, concentration (HHI) is ${Math.round(income.concentration * 100) / 100}${income.passiveMomentum != null ? `, momentum ${Math.round(income.passiveMomentum * 100) / 100}x` : ""} — which lands in the ${bandLabel} band.`
          : "No income recorded in the last 30 days, so no band can be assigned.",
    },
    state: "ok",
    contributions,
    explanation:
      income.total30d > 0
        ? `${pct(income.passiveShare)}% of the last 30 days came from assets rather than flying, spread across ${income.ownedAirports} owned airport${income.ownedAirports === 1 ? "" : "s"}.`
        : "No income recorded in the last 30 days — Income Health activates with your next flights.",
  };
}

// --- Hub Capacity Health ---------------------------------------------------
// Domain scale: capacity-weighted portfolio utilization. Every value below is
// published by the airport module; the only logic owned here is the weighted
// average (composition) and the banding.

function composeHubCapacityHealth(inputs: EngineInputs): CompositeScore {
  const cap = inputs.hubCapacity;
  if (cap.state !== "ok") {
    return unavailableComposite(
      "hub-capacity-health",
      "Airport Health",
      "Capacity-weighted portfolio utilization",
      cap.state,
      "How much of your owned airports' weekly capacity is actually used, weighted by airport size.",
      "Airport Intelligence is temporarily unavailable.",
    );
  }
  const rated = cap.airports.filter((a) => a.utilization != null);
  if (rated.length === 0) {
    return unavailableComposite(
      "hub-capacity-health",
      "Airport Health",
      "Capacity-weighted portfolio utilization",
      "ok",
      "How much of your owned airports' weekly capacity is actually used, weighted by airport size.",
      "No owned airport has enough observed weeks yet to rate traffic.",
    );
  }

  // Peer groups: your own owned airports sharing a tier. Only meaningful when
  // at least two airports share a tier — solo tiers produce no index at all.
  const byTier = new Map<number, typeof rated>();
  for (const a of rated) {
    const list = byTier.get(a.tier) ?? [];
    list.push(a);
    byTier.set(a.tier, list);
  }

  const peerRatios: { icao: string; tier: number; ratio: number; util: number }[] = [];
  for (const [tier, group] of byTier) {
    if (group.length < 2) continue;
    const mean =
      group.reduce((s, a) => s + (a.utilization as number), 0) / group.length;
    if (mean <= 0) continue;
    for (const a of group) {
      peerRatios.push({
        icao: a.icao,
        tier,
        ratio: (a.utilization as number) / mean,
        util: a.utilization as number,
      });
    }
  }

  const saturated = rated.filter((a) => (a.utilization as number) >= 0.95);

  // Capacity-weighted portfolio utilization: larger airports carry more weight
  // than small fields, so the summary reflects operational importance.
  const totalCapacity = rated.reduce((s, a) => s + a.capacity, 0);
  const totalUsed = rated.reduce((s, a) => s + a.usedAvg, 0);
  const weighted = totalCapacity > 0 ? totalUsed / totalCapacity : 0;
  const score = Math.round(pct(weighted));

  const breakdown = [...rated]
    .sort((a, b) => b.capacity - a.capacity)
    .map((a) => ({
      key: a.icao,
      label: a.icao,
      sublabel: `Tier ${a.tier} · ${cap.weeksObserved}w avg ops/wk`,
      used: Math.round(a.usedAvg),
      capacity: a.capacity,
      ratio: a.utilization as number,
    }));

  const contributions: MetricContribution[] = [
    {
      id: "airport-utilization.weighted_utilization.v1",
      sourceModule: "airport-utilization",
      sourceVersion: cap.sourceVersion,
      value: score,
      label: `Capacity-weighted portfolio utilization (${cap.weeksObserved}w)`,
      unit: "%",
    },
    {
      id: "airport-utilization.portfolio_capacity.v1",
      sourceModule: "airport-utilization",
      sourceVersion: cap.sourceVersion,
      value: totalCapacity,
      label: "Total weekly capacity across owned airports",
      unit: "ops",
    },
    {
      id: "airport-utilization.saturated_airports.v1",
      sourceModule: "airport-utilization",
      sourceVersion: cap.sourceVersion,
      value: saturated.length,
      label: "Airports at/over capacity",
      unit: "count",
    },
  ];
  for (const a of breakdown) {
    contributions.push({
      id: `airport-utilization.raw_fill.${a.key}.v1`,
      sourceModule: "airport-utilization",
      sourceVersion: cap.sourceVersion,
      value: pct(a.ratio),
      label: `${a.key} avg weekly operations (${a.used}/${a.capacity} ops · ${cap.weeksObserved}w avg, arrivals + departures)`,
      unit: "%",
      ref: { icao: a.key },
    });
  }
  // Peer indexes are appended only where a real peer group exists.
  for (const p of peerRatios) {
    contributions.push({
      id: `airport-utilization.tier_index.${p.icao}.v1`,
      sourceModule: "airport-utilization",
      sourceVersion: cap.sourceVersion,
      value: Math.round(p.ratio * 100),
      label: `${p.icao} vs Tier ${p.tier} peers (100 = typical)`,
      ref: { icao: p.icao, tier: p.tier },
    });
  }

  const band: CompositeScore["band"] =
    score >= 90 ? "watch" : score >= 70 ? "strong" : score >= 40 ? "healthy" : "watch";
  const bandLabel =
    score >= 90
      ? "At capacity"
      : score >= 70
        ? "Busy"
        : score >= 40
          ? "Healthy utilization"
          : "Spare capacity";

  const busiest = breakdown.reduce((best, a) => (a.ratio > best.ratio ? a : best), breakdown[0]);
  const quietest = breakdown.reduce((low, a) => (a.ratio < low.ratio ? a : low), breakdown[0]);

  return {
    id: "hub-capacity-health",
    label: "Airport Health",
    score,
    band,
    scoreUnit: "%",
    scaleLabel: "Capacity-weighted portfolio utilization",
    bandLabel,
    rationale: {
      measured:
        "Weekly airport operations (arrivals + departures) against capacity for each owned airport, combined into one portfolio figure weighted by each airport's capacity — a large hub moves the number more than a small field.",
      good: "Roughly 40–70% is healthy headroom. Above 90% the portfolio is turning traffic away and upgrades pay off; below 40% there is substantial spare capacity.",
      why:
        `Across ${breakdown.length} owned airport${breakdown.length === 1 ? "" : "s"} the portfolio uses ${totalUsed.toFixed(0)} of ${totalCapacity} weekly slots` +
        (busiest ? ` — busiest ${busiest.key} at ${pct(busiest.ratio)}%` : "") +
        (quietest && quietest.key !== busiest?.key
          ? `, quietest ${quietest.key} at ${pct(quietest.ratio)}%`
          : "") +
        ".",
    },
    state: "ok",
    contributions,
    breakdown,
    explanation:
      `Your airports use ${score}% of their combined weekly capacity over ${cap.weeksObserved} weeks, weighted by airport size.` +
      (saturated.length > 0
        ? ` ${saturated.length} hub${saturated.length === 1 ? " is" : "s are"} at or over capacity and losing traffic — that is an upgrade signal.`
        : ""),
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
            id: "airport-utilization.capacity.v2",
            sourceModule: "airport-utilization",
            sourceVersion: cap.sourceVersion,
            value: top.capacity,
            label: "Weekly capacity",
            unit: "slots",
            ref: { icao: top.icao },
          },
          {
            id: "airport-utilization.used_avg.v2",
            sourceModule: "airport-utilization",
            sourceVersion: cap.sourceVersion,
            value: Math.round(top.usedAvg * 10) / 10,
            label: "Average weekly operations",
            unit: "operations",
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

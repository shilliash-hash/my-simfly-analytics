import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  Sparkles,
  ArrowRight,
  ShieldAlert,
  Loader2,
  Clock,
  Plane,
  Building2,
  Compass,
  Check,
  RefreshCw,
} from "lucide-react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { HubSupportGate } from "@/components/hub-support";
import { PortfolioLoadingSequence } from "@/components/portfolio-loading-sequence";
import { getHubSupportStatus } from "@/lib/hub-support.functions";
import {
  getPortfolioSnapshot,
  runPortfolioAnalysis,
} from "@/lib/portfolio.functions";
import { getAircraftUtilizationTimeline } from "@/lib/aircraft-utilization.functions";
import { getAirportUtilizationTimeline } from "@/lib/simfly.functions";
import { useSimflyArgs } from "@/lib/viewed-user";
import { cn } from "@/lib/utils";
import type {
  CompositeScore,
  PortfolioReport,
  Recommendation,
  RecommendationTier,
} from "@/lib/portfolio-engine";

const TIER_LABEL: Record<RecommendationTier, string> = {
  immediate: "Immediate",
  planned: "Planned",
  consider: "Consider",
};

export const Route = createFileRoute("/portfolio")({
  head: () => ({
    meta: [
      { title: "Portfolio Intelligence — SimFly Hub" },
      {
        name: "description",
        content:
          "Executive orchestration layer that composes every SimFly intelligence module into one strategic view and the single next action to take.",
      },
      { property: "og:title", content: "Portfolio Intelligence — SimFly Hub" },
      {
        property: "og:description",
        content:
          "Composite scores and ranked recommendations distilled from every SimFly intelligence module.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PortfolioPage,
});

function PortfolioPage() {
  const args = useSimflyArgs();
  const supportQ = useQuery({
    queryKey: ["hub-support", args.keyTag],
    queryFn: () => getHubSupportStatus({ data: args.payload }),
    staleTime: 60_000,
  });

  return (
    <AppShell>
      <PageHeader
        title="Portfolio Intelligence"
        description="Orchestration layer — composes every intelligence module into one strategic view."
      />
      {supportQ.data?.active ? (
        <PortfolioBody />
      ) : (
        <HubSupportGate featureName="Portfolio Intelligence" />
      )}
    </AppShell>
  );
}

function PortfolioBody() {
  const args = useSimflyArgs();
  const [forceConsole, setForceConsole] = useState(false);

  const fetchSnapshot = useServerFn(getPortfolioSnapshot);
  const snapshotQ = useQuery({
    queryKey: ["portfolio-snapshot", args.keyTag],
    queryFn: () => fetchSnapshot({ data: args.payload }),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const runAircraft = useServerFn(getAircraftUtilizationTimeline);
  const runAirport = useServerFn(getAirportUtilizationTimeline);
  const runPortfolio = useServerFn(runPortfolioAnalysis);

  const aircraftM = useMutation({
    mutationFn: () => runAircraft({ data: { ...args.payload, weeks: 8 } }),
  });
  const airportM = useMutation({
    mutationFn: () => runAirport({ data: args.payload }),
  });
  const portfolioM = useMutation({
    mutationFn: () => runPortfolio({ data: args.payload }),
  });

  if (snapshotQ.isLoading) {
    return (
      <div className="mt-8 flex items-center gap-3 rounded-2xl border border-border/60 bg-card/70 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Looking up this week's strategic briefing…
      </div>
    );
  }

  if (portfolioM.isPending) return <PortfolioLoadingSequence />;

  const report: PortfolioReport | null =
    portfolioM.data ?? (forceConsole ? null : snapshotQ.data ?? null);

  if (report) {
    return (
      <ReportView
        report={report}
        stored={!portfolioM.data}
        onRerun={() => {
          setForceConsole(true);
          aircraftM.reset();
          airportM.reset();
          portfolioM.reset();
        }}
      />
    );
  }

  const step1Done = aircraftM.isSuccess;
  const step2Done = airportM.isSuccess;
  const ready = step1Done && step2Done;

  return (
    <div className="mt-6 space-y-6">
      <div className="rounded-2xl border border-border/60 bg-card/70 p-6">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Orchestration console
        </div>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Portfolio Intelligence does not create data of its own — it composes
          the published output of the other intelligence modules. Refresh each
          module below, then run the composition.
        </p>

        <div className="mt-6 space-y-3">
          <StepRow
            index={1}
            icon={Plane}
            title="Generate current Aircraft Intelligence"
            summary={
              aircraftM.data
                ? `${aircraftM.data.aircraft.length} tails · ${aircraftM.data.weeks.length} weeks analysed`
                : undefined
            }
            state={
              aircraftM.isPending
                ? "running"
                : aircraftM.isError
                  ? "error"
                  : step1Done
                    ? "done"
                    : "idle"
            }
            error={aircraftM.error ? String(aircraftM.error) : undefined}
            onRun={() => aircraftM.mutate()}
          />
          <StepRow
            index={2}
            icon={Building2}
            title="Generate current Airport Intelligence"
            summary={
              airportM.data
                ? `${airportM.data.airportMeta.length} airports · ${airportM.data.weeks.length} weeks analysed`
                : undefined
            }
            state={
              airportM.isPending
                ? "running"
                : airportM.isError
                  ? "error"
                  : step2Done
                    ? "done"
                    : "idle"
            }
            error={airportM.error ? String(airportM.error) : undefined}
            onRun={() => airportM.mutate()}
          />
          <StepRow
            index={3}
            icon={Compass}
            title="Run Portfolio Analysis"
            summary={
              ready
                ? "Both intelligence modules are current — composition can run."
                : "Complete steps 1 and 2 to enable."
            }
            state={
              portfolioM.isError ? "error" : ready ? "idle" : "locked"
            }
            error={portfolioM.error ? String(portfolioM.error) : undefined}
            onRun={() => portfolioM.mutate()}
            primary
          />
        </div>
      </div>

      {snapshotQ.data && forceConsole && (
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-border/60 bg-card/50 p-4 text-sm text-muted-foreground">
          <span>
            A briefing for this week already exists (composed{" "}
            {new Date(snapshotQ.data.generatedAtIso).toLocaleString()}). Running
            a new analysis replaces it.
          </span>
          <button
            type="button"
            onClick={() => setForceConsole(false)}
            className="whitespace-nowrap rounded-full border border-border/60 bg-background/60 px-3 py-1.5 text-xs font-medium hover:bg-background"
          >
            View stored briefing
          </button>
        </div>
      )}
    </div>
  );
}

function StepRow({
  index,
  icon: Icon,
  title,
  summary,
  state,
  error,
  onRun,
  primary,
}: {
  index: number;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  summary?: string;
  state: "idle" | "running" | "done" | "error" | "locked";
  error?: string;
  onRun: () => void;
  primary?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-4 rounded-xl border border-border/50 bg-background/40 p-4",
        state === "done" && "border-emerald-500/40 bg-emerald-500/5",
        state === "error" && "border-destructive/50 bg-destructive/5",
        state === "locked" && "opacity-60",
      )}
    >
      <span
        className={cn(
          "grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-secondary text-muted-foreground",
          state === "done" && "bg-emerald-500/10 text-emerald-300",
          primary && state === "idle" && "bg-primary/10 text-primary",
        )}
      >
        {state === "done" ? (
          <Check className="h-4 w-4" />
        ) : state === "running" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Icon className="h-4 w-4" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">
          <span className="mr-2 text-xs uppercase tracking-wider text-muted-foreground">
            Step {index}
          </span>
          {title}
        </div>
        {(summary || error) && (
          <p
            className={cn(
              "mt-0.5 truncate text-xs",
              error ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {error ?? summary}
          </p>
        )}
      </div>
      <button
        type="button"
        disabled={state === "running" || state === "locked"}
        onClick={onRun}
        className={cn(
          "shrink-0 rounded-full border px-4 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
          primary
            ? "border-primary/50 bg-primary/10 text-primary hover:bg-primary/20"
            : "border-border/60 bg-background/60 hover:bg-background",
        )}
      >
        {state === "running"
          ? "Running…"
          : state === "done"
            ? "Refresh"
            : state === "error"
              ? "Retry"
              : "Run"}
      </button>
    </div>
  );
}

function ReportView({
  report,
  stored,
  onRerun,
}: {
  report: PortfolioReport;
  stored: boolean;
  onRerun: () => void;
}) {
  return (
    <div className="mt-6 space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card/70 p-4 text-sm">
        <span className="text-muted-foreground">
          {stored
            ? "Stored weekly briefing — this assessment stays stable until you run a new analysis."
            : "Fresh composition — saved as this week's briefing."}{" "}
          Composed {new Date(report.generatedAtIso).toLocaleString()}.
        </span>
        <button
          type="button"
          onClick={onRerun}
          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border/60 bg-background/60 px-3 py-1.5 text-xs font-medium hover:bg-background"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Re-run analysis
        </button>
      </div>

      <HorizonBanner
        horizonStartedAtIso={report.horizonStartedAtIso}
        isFirstGeneration={report.isFirstGeneration}
      />

      {report.degradedSources.length > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm text-amber-200">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Some intelligence modules are temporarily unavailable
            ({report.degradedSources.join(", ")}). Composite tiles and
            recommendations that require them are hidden — no partial values are
            shown. This week's briefing was not persisted.
          </span>
        </div>
      )}

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Composite scores
        </h2>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {report.composites.map((c) => (
            <CompositeTile key={c.id} composite={c} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Next actions
        </h2>
        {report.recommendations.length === 0 ? (
          <div className="rounded-2xl border border-border/60 bg-card/70 p-6 text-sm text-muted-foreground">
            <Sparkles className="mb-2 inline h-4 w-4 text-primary" /> No
            recommendation crosses the confidence bar right now. The engine
            deliberately stays silent when historical evidence and current state
            do not agree.
          </div>
        ) : (
          <div className="space-y-6">
            {(["immediate", "planned", "consider"] as RecommendationTier[]).map(
              (tier) => {
                const group = report.recommendations.filter((r) => r.tier === tier);
                if (group.length === 0) return null;
                return (
                  <div key={tier}>
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                      {TIER_LABEL[tier]} · {group.length}
                    </div>
                    <div className="space-y-3">
                      {group.map((r) => (
                        <RecommendationCard key={r.id} rec={r} />
                      ))}
                    </div>
                  </div>
                );
              },
            )}
          </div>
        )}
      </section>

      <footer className="pt-2 text-[11px] text-muted-foreground/70">
        Engine v{report.weightsVersion} · Rules v{report.ruleRegistryVersion} ·
        Week {report.weekStartUtcIso.slice(0, 10)}
      </footer>
    </div>
  );
}

function HorizonBanner({
  horizonStartedAtIso,
  isFirstGeneration,
}: {
  horizonStartedAtIso: string;
  isFirstGeneration: boolean;
}) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4 text-sm text-primary-foreground/90">
      <Clock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div>
        {isFirstGeneration ? (
          <>
            <strong className="text-primary">Decision horizon anchored.</strong>{" "}
            This is your first Portfolio Intelligence generation. Historical
            data before this moment is used as evidence and baseline only —
            every recommendation from now on is evaluated against your
            current portfolio state.
          </>
        ) : (
          <>
            Decision horizon:{" "}
            <strong className="text-primary">
              {new Date(horizonStartedAtIso).toLocaleString()}
            </strong>
            . Historical values before this point serve as baseline; every
            recommendation is evaluated against the current portfolio state.
          </>
        )}
      </div>
    </div>
  );
}

function CompositeTile({ composite }: { composite: CompositeScore }) {
  const bandColor: Record<CompositeScore["band"], string> = {
    strong: "text-emerald-300 border-emerald-500/40",
    healthy: "text-cyan-300 border-cyan-500/40",
    watch: "text-amber-300 border-amber-500/40",
    weak: "text-rose-300 border-rose-500/40",
    unknown: "text-muted-foreground border-border/50",
  };
  return (
    <div
      className={cn(
        "flex flex-col rounded-2xl border bg-card/70 p-5 backdrop-blur",
        bandColor[composite.band],
      )}
    >
      <div className="text-xs uppercase tracking-wider text-muted-foreground">
        {composite.label}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <div className="text-4xl font-semibold tabular-nums">
          {composite.score ?? "—"}
          {composite.score != null && composite.scoreUnit ? (
            <span className="text-xl">{composite.scoreUnit}</span>
          ) : null}
        </div>
        <div className="text-xs font-medium uppercase tracking-wider">
          {composite.bandLabel}
        </div>
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground/80">
        {composite.scaleLabel}
      </div>

      <p className="mt-3 text-sm text-muted-foreground">{composite.explanation}</p>

      <dl className="mt-4 space-y-2 border-t border-border/40 pt-3 text-xs">
        <ExplainRow term="What is measured" desc={composite.rationale.measured} />
        <ExplainRow term="What is good" desc={composite.rationale.good} />
        <ExplainRow term="Why this band" desc={composite.rationale.why} />
      </dl>

      {composite.state !== "ok" && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-border/50 bg-background/40 px-2.5 py-1.5 text-[11px] text-muted-foreground">
          <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
          Source module unavailable — no partial score is shown.
        </div>
      )}
      {composite.contributions.length > 0 && (
        <details className="mt-3 text-xs text-muted-foreground/80">
          <summary className="cursor-pointer select-none">Evidence</summary>
          <ul className="mt-2 space-y-1">
            {composite.contributions.map((m) => (
              <li key={m.id} className="flex justify-between gap-3">
                <span className="truncate">{m.label}</span>
                <span className="tabular-nums text-foreground/80">
                  {m.value ?? "—"}
                  {m.unit ? ` ${m.unit}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function ExplainRow({ term, desc }: { term: string; desc: string }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
        {term}
      </dt>
      <dd className="text-muted-foreground">{desc}</dd>
    </div>
  );
}

function RecommendationCard({ rec }: { rec: Recommendation }) {
  const tierStyle: Record<RecommendationTier, string> = {
    immediate: "border-rose-500/50 bg-rose-500/5",
    planned: "border-amber-500/40 bg-amber-500/5",
    consider: "border-cyan-500/40 bg-cyan-500/5",
  };
  return (
    <div className={cn("rounded-2xl border p-5 backdrop-blur", tierStyle[rec.tier])}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider opacity-80">
            {TIER_LABEL[rec.tier]}
          </div>
          <div className="mt-1 text-base font-semibold">{rec.title}</div>
          <p className="mt-1 text-sm text-muted-foreground">{rec.detail}</p>
        </div>
        <Link
          to={rec.actionRoute}
          className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-border/60 bg-background/60 px-3 py-1.5 text-xs font-medium hover:bg-background"
        >
          {rec.actionLabel}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      <details className="mt-3 text-xs text-muted-foreground/80">
        <summary className="cursor-pointer select-none">Why this?</summary>
        <ul className="mt-2 space-y-1">
          {rec.evidence.map((m) => (
            <li key={m.id} className="flex justify-between gap-3">
              <span className="truncate">
                {m.label}
                <span className="ml-1 opacity-60">· {m.sourceModule}</span>
              </span>
              <span className="tabular-nums text-foreground/80">
                {typeof m.value === "number"
                  ? Math.round(m.value * 100) / 100
                  : m.value ?? "—"}
                {m.unit ? ` ${m.unit}` : ""}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

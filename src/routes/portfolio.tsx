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
  Info,
} from "lucide-react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { HubSupportGate } from "@/components/hub-support";
import { PortfolioLoadingSequence } from "@/components/portfolio-loading-sequence";
import { AirportUtilizationBars } from "@/components/airport-utilization-bars";

import {
  PortfolioDetailDialog,
  MethodologyBlock,
  MetricTable,
  Section,
  ACCENT,
  type AccentKey,
} from "@/components/portfolio-detail-dialog";
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
        title="Monthly Intelligence Brief (MIB)"
        description="Orchestration layer — composes every intelligence module into one strategic view. MIB uses a rolling 4-week analysis window rather than calendar months."
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
          Refresh each module below, then run the composition.
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
          {stored ? "Stored weekly briefing" : "Fresh composition"} ·{" "}
          {new Date(report.generatedAtIso).toLocaleString()}
        </span>
        <div className="flex items-center gap-2">
          <MethodologyButton report={report} />
          <button
            type="button"
            onClick={onRerun}
            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border/60 bg-background/60 px-3 py-1.5 text-xs font-medium hover:bg-background"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Re-run analysis
          </button>
        </div>
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
    <div className="flex items-start gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4 text-sm text-foreground/85">
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


function accentFor(id: string): AccentKey {
  if (id.startsWith("income")) return "income";
  if (id.startsWith("hub")) return "instrument";
  if (id.startsWith("asset")) return "runway";
  return "neutral";
}

function CompositeTile({ composite }: { composite: CompositeScore }) {
  const [open, setOpen] = useState(false);
  const accent = composite.band === "unknown" ? "neutral" : accentFor(composite.id);
  const a = ACCENT[accent];

  return (
    <>
      <div
        className={cn(
          "group relative flex flex-col overflow-hidden rounded-2xl border bg-card/70 p-6 backdrop-blur transition-colors",
          a.border,
          a.glow,
        )}
      >
        <div className={cn("absolute inset-x-0 top-0 h-px", a.strip)} />
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {composite.label}
        </div>

        <div className="mt-4 flex items-end gap-2">
          <div className="text-5xl font-semibold leading-none tracking-tight tabular-nums text-foreground">
            {composite.score ?? "—"}
            {composite.score != null && composite.scoreUnit ? (
              <span className="text-2xl text-muted-foreground">
                {composite.scoreUnit}
              </span>
            ) : null}
          </div>
        </div>
        <div
          className={cn(
            "mt-2 text-[11px] font-semibold uppercase tracking-[0.16em]",
            a.text,
          )}
        >
          {composite.bandLabel}
        </div>

        <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
          {composite.explanation}
        </p>

        {composite.breakdown && composite.breakdown.length > 0 && (
          <AirportUtilizationBars rows={composite.breakdown} />
        )}


        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-5 inline-flex items-center gap-1 self-end text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          View details
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <PortfolioDetailDialog
        open={open}
        onOpenChange={setOpen}
        eyebrow={composite.label}
        accent={accent}
        title={`${composite.score ?? "—"}${composite.scoreUnit ?? ""} · ${composite.bandLabel}`}
        subtitle={composite.scaleLabel}
      >
        <p className="text-sm text-muted-foreground">{composite.explanation}</p>

        <Section title="Methodology">
          <MethodologyBlock
            measured={composite.rationale.measured}
            good={composite.rationale.good}
            why={composite.rationale.why}
          />
        </Section>

        <Section title="Evidence">
          <MetricTable metrics={composite.contributions} showSource />
        </Section>

        {composite.state !== "ok" && (
          <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
            <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
            Source module unavailable — no partial score is shown.
          </div>
        )}
      </PortfolioDetailDialog>
    </>
  );
}

function RecommendationCard({ rec }: { rec: Recommendation }) {
  const [open, setOpen] = useState(false);
  const tierChip: Record<RecommendationTier, string> = {
    immediate: "border-rose-500/40 bg-rose-500/10 text-rose-300",
    planned: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    consider: "border-cyan-500/40 bg-cyan-500/10 text-cyan-300",
  };
  const tierEdge: Record<RecommendationTier, string> = {
    immediate: "bg-rose-400/70",
    planned: "bg-amber-400/70",
    consider: "bg-cyan-400/70",
  };

  return (
    <>
      <div className="relative overflow-hidden rounded-2xl border border-border/60 bg-card/70 p-5 backdrop-blur">
        <div
          className={cn("absolute inset-y-0 left-0 w-[2px]", tierEdge[rec.tier])}
        />
        <span
          className={cn(
            "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em]",
            tierChip[rec.tier],
          )}
        >
          {TIER_LABEL[rec.tier]}
        </span>
        <div className="mt-2 text-lg font-semibold tracking-tight text-foreground">
          {rec.title}
        </div>
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
          {rec.detail}
        </p>
        <div className="mt-4 flex items-center gap-3">
          <Link
            to={rec.actionRoute}
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/50 bg-primary/10 px-4 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
          >
            {rec.actionLabel}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            View details
          </button>
        </div>
      </div>

      <PortfolioDetailDialog
        open={open}
        onOpenChange={setOpen}
        eyebrow={TIER_LABEL[rec.tier]}
        accent="neutral"
        title={rec.title}
      >
        <p className="text-sm text-muted-foreground">{rec.detail}</p>

        <Section title="Evidence">
          <MetricTable metrics={rec.evidence} showSource />
        </Section>

        <Section title="Rule">
          <p className="text-xs text-muted-foreground">
            {rec.ruleId} · priority {rec.priority}
          </p>
        </Section>

        <Link
          to={rec.actionRoute}
          className="inline-flex items-center gap-1.5 rounded-full border border-primary/50 bg-primary/10 px-4 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/20"
        >
          {rec.actionLabel}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </PortfolioDetailDialog>
    </>
  );
}

function MethodologyButton({ report }: { report: PortfolioReport }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border/60 bg-background/60 px-3 py-1.5 text-xs font-medium hover:bg-background"
      >
        <Info className="h-3.5 w-3.5" />
        How is this calculated?
      </button>
      <PortfolioDetailDialog
        open={open}
        onOpenChange={setOpen}
        eyebrow="Methodology"
        title="How MIB is calculated"
        subtitle="Composition only — every number below is published by another module."
      >
        <p className="text-sm text-muted-foreground">
          Monthly Intelligence Bief does not create data of its own. It composes the
          published output of Aircraft Intelligence, Airport Intelligence and
          Income Intelligence into composite scores, then applies a fixed rule
          registry to rank the next actions. Each composite is scored on its own
          domain scale — open a card's details to see what is measured, what a
          good value looks like, and why it lands in its current band.
        </p>
        <Section title="Briefing stability">
          <p className="text-sm text-muted-foreground">
            The briefing is stored once per SimFly week and stays stable until you
            re-run the analysis. Re-running overwrites this week's briefing only;
            earlier weeks are never modified.
          </p>
        </Section>
        <Section title="Versions">
          <p className="text-xs text-muted-foreground">
            Engine v{report.weightsVersion} · Rules v{report.ruleRegistryVersion} ·
            Week {report.weekStartUtcIso.slice(0, 10)}
          </p>
        </Section>
      </PortfolioDetailDialog>
    </>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Compass,
  Sparkles,
  ArrowRight,
  ShieldAlert,
  Loader2,
  Clock,
} from "lucide-react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { HubSupportGate } from "@/components/hub-support";
import { getHubSupportStatus } from "@/lib/hub-support.functions";
import { getPortfolioReport } from "@/lib/portfolio.functions";
import { useSimflyArgs } from "@/lib/viewed-user";
import { cn } from "@/lib/utils";
import type {
  CompositeScore,
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
  const fetchReport = useServerFn(getPortfolioReport);
  const reportQ = useQuery({
    queryKey: ["portfolio-report", args.keyTag],
    queryFn: () => fetchReport({ data: args.payload }),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  if (reportQ.isLoading) {
    return (
      <div className="mt-8 flex items-center gap-3 rounded-2xl border border-border/60 bg-card/70 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Composing your Portfolio report — fanning out to every intelligence module.
      </div>
    );
  }
  if (reportQ.error || !reportQ.data) {
    return (
      <div className="mt-8 flex items-center gap-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
        <ShieldAlert className="h-4 w-4" />
        Portfolio Intelligence could not be composed right now. Its upstream
        modules remain fully available on their own pages.
      </div>
    );
  }
  const report = reportQ.data;

  return (
    <div className="mt-6 space-y-8">
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
            shown. Snapshot for this week will not be persisted until every
            source recovers.
          </span>
        </div>
      )}

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Composite scores
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
        Composed {new Date(report.generatedAtIso).toLocaleString()} · Week{" "}
        {report.weekStartUtcIso.slice(0, 10)}
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
        "rounded-2xl border bg-card/70 p-5 backdrop-blur",
        bandColor[composite.band],
      )}
    >
      <div className="text-xs uppercase tracking-wider text-muted-foreground">
        {composite.label}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <div className="text-4xl font-semibold tabular-nums">
          {composite.score ?? "—"}
        </div>
        <div className="text-xs uppercase tracking-wider opacity-80">
          {composite.band}
        </div>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{composite.explanation}</p>
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

function RecommendationCard({ rec }: { rec: Recommendation }) {
  const tierStyle: Record<RecommendationTier, string> = {
    immediate: "border-rose-500/50 bg-rose-500/5",
    planned: "border-amber-500/40 bg-amber-500/5",
    consider: "border-cyan-500/40 bg-cyan-500/5",
  };
  const tierLabel: Record<RecommendationTier, string> = {
    immediate: "Immediate",
    planned: "Planned",
    consider: "Consider",
  };
  return (
    <div className={cn("rounded-2xl border p-5 backdrop-blur", tierStyle[rec.tier])}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider opacity-80">
            {tierLabel[rec.tier]}
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

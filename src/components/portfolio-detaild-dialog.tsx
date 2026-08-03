import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { MetricContribution } from "@/lib/portfolio-engine";

/**
 * Presentational shell for every Portfolio Intelligence popout.
 * Contains no analytics logic — it only renders values handed to it.
 */
export function PortfolioDetailDialog({
  open,
  onOpenChange,
  eyebrow,
  title,
  subtitle,
  accent = "runway",
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  accent?: AccentKey;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto border-border/60 bg-card/95 backdrop-blur-xl sm:max-w-2xl">
        <div
          className={cn(
            "absolute inset-x-0 top-0 h-px",
            ACCENT[accent].strip,
          )}
        />
        <DialogHeader>
          {eyebrow && (
            <div
              className={cn(
                "text-[11px] font-semibold uppercase tracking-[0.18em]",
                ACCENT[accent].text,
              )}
            >
              {eyebrow}
            </div>
          )}
          <DialogTitle className="text-xl">{title}</DialogTitle>
          {subtitle && (
            <DialogDescription className="text-sm">{subtitle}</DialogDescription>
          )}
        </DialogHeader>
        <div className="space-y-6">{children}</div>
      </DialogContent>
    </Dialog>
  );
}

export type AccentKey = "runway" | "income" | "instrument" | "neutral";

export const ACCENT: Record<
  AccentKey,
  { text: string; border: string; strip: string; glow: string }
> = {
  runway: {
    text: "text-cyan-300",
    border: "border-cyan-500/30",
    strip: "bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent",
    glow: "shadow-[0_18px_50px_-30px_rgba(34,211,238,0.65)]",
  },
  income: {
    text: "text-emerald-300",
    border: "border-emerald-500/30",
    strip: "bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent",
    glow: "shadow-[0_18px_50px_-30px_rgba(16,185,129,0.6)]",
  },
  instrument: {
    text: "text-amber-300",
    border: "border-amber-500/30",
    strip: "bg-gradient-to-r from-transparent via-amber-400/60 to-transparent",
    glow: "shadow-[0_18px_50px_-30px_rgba(245,158,11,0.6)]",
  },
  neutral: {
    text: "text-muted-foreground",
    border: "border-border/60",
    strip: "bg-gradient-to-r from-transparent via-foreground/20 to-transparent",
    glow: "",
  },
};

export function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/80">
        {title}
      </h3>
      {children}
    </section>
  );
}

export function MethodologyBlock({
  measured,
  good,
  why,
}: {
  measured: string;
  good: string;
  why: string;
}) {
  return (
    <dl className="space-y-3 rounded-xl border border-border/50 bg-background/40 p-4 text-sm">
      <ExplainRow term="What is measured" desc={measured} />
      <ExplainRow term="What good looks like" desc={good} />
      <ExplainRow term="Why this band" desc={why} />
    </dl>
  );
}

export function ExplainRow({ term, desc }: { term: string; desc: string }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
        {term}
      </dt>
      <dd className="mt-0.5 text-muted-foreground">{desc}</dd>
    </div>
  );
}

export function MetricTable({
  metrics,
  showSource,
}: {
  metrics: MetricContribution[];
  showSource?: boolean;
}) {
  if (metrics.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No supporting metrics were recorded.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-border/40 rounded-xl border border-border/50 bg-background/40">
      {metrics.map((m) => (
        <li
          key={m.id}
          className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm"
        >
          <span className="min-w-0 truncate text-muted-foreground">
            {m.label}
            {showSource && (
              <span className="ml-1.5 text-[11px] opacity-60">
                · {m.sourceModule}
              </span>
            )}
          </span>
          <span className="shrink-0 font-medium tabular-nums text-foreground">
            {typeof m.value === "number"
              ? Math.round(m.value * 100) / 100
              : (m.value ?? "—")}
            {m.unit ? ` ${m.unit}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

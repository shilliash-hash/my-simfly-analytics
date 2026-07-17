import { useEffect, useState } from "react";
import {
  Coins,
  Building2,
  Plane,
  BadgeCheck,
  ShieldCheck,
  LineChart,
  Loader2,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Phase = {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: "runway" | "instrument";
};

const PHASES: Phase[] = [
  { label: "Loading accounting ledger", icon: Coins, accent: "runway" },
  { label: "Reconciling airport revenue", icon: Building2, accent: "runway" },
  { label: "Reconciling aircraft rentals", icon: Plane, accent: "runway" },
  { label: "Reconciling licences income", icon: BadgeCheck, accent: "runway" },
  { label: "Running consistency checks", icon: ShieldCheck, accent: "instrument" },
  { label: "Generating analytics", icon: LineChart, accent: "runway" },
];

const CADENCE_MS = 700;

function usePhaseIndex() {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => {
      setIdx((prev) => (prev < PHASES.length - 1 ? prev + 1 : prev));
    }, CADENCE_MS);
    return () => clearInterval(t);
  }, []);
  return idx;
}

export function IncomeLoadingSequence({
  variant = "page",
}: {
  variant?: "page" | "overlay";
}) {
  const active = usePhaseIndex();

  if (variant === "overlay") {
    return (
      <div className="pointer-events-none absolute inset-0 z-20 flex items-start justify-end p-4">
        <div className="pointer-events-auto panel runway-glow relative overflow-hidden rounded-full px-4 py-1.5 text-xs">
          <span
            className="scanline pointer-events-none absolute inset-y-0 left-0 w-1/3"
            style={{ animation: "scanline 2.2s ease-in-out infinite" }}
          />
          <span className="relative flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-runway" />
            <span className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Reconciling ·
            </span>
            <span className="text-runway">{PHASES[active].label}…</span>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="panel flight-deck-grad relative overflow-hidden rounded-xl p-8 min-h-[560px]">
      <span
        className="scanline pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ animation: "scanline 2.2s ease-in-out infinite" }}
      />

      <div className="mono text-[10px] uppercase tracking-widest text-runway">
        Income Intelligence · Reconciling
      </div>
      <h2 className="font-display mt-2 text-3xl font-semibold tracking-tight text-balance">
        {PHASES[active].label}…
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Preparing your active vs passive breakdown from the shared accounting engine.
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
        <ol className="space-y-3">
          {PHASES.map((p, i) => {
            const state: "done" | "active" | "pending" =
              i < active ? "done" : i === active ? "active" : "pending";
            const Icon = p.icon;
            const accentText =
              p.accent === "instrument" ? "text-instrument" : "text-runway";
            const rowText =
              state === "done"
                ? "text-muted-foreground"
                : state === "active"
                  ? "text-foreground"
                  : "text-muted-foreground/60";
            return (
              <li
                key={p.label}
                className={cn(
                  "flex items-center gap-3 rounded-lg border border-border/40 bg-secondary/20 px-3 py-2.5 transition-colors",
                  state === "active" && "runway-glow border-runway/40 bg-runway/5",
                )}
              >
                <span
                  className={cn(
                    "grid h-8 w-8 place-items-center rounded-md",
                    state === "active"
                      ? cn("bg-runway/10", accentText)
                      : state === "done"
                        ? "bg-secondary text-runway"
                        : "bg-secondary text-muted-foreground/50",
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className={cn("flex-1 text-sm", rowText)}>{p.label}</span>
                <span className="w-4">
                  {state === "done" ? (
                    <Check className="h-4 w-4 text-runway" />
                  ) : state === "active" ? (
                    <Loader2 className={cn("h-4 w-4 animate-spin", accentText)} />
                  ) : (
                    <span className="mono text-[10px] text-muted-foreground/40">·</span>
                  )}
                </span>
              </li>
            );
          })}
        </ol>

        <div className="space-y-4">
          <div className="grid gap-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="panel h-16 animate-pulse rounded-xl"
                style={{ animationDelay: `${i * 180}ms` }}
              />
            ))}
          </div>
          <div className="panel grid place-items-center rounded-xl p-4">
            <div
              className="h-32 w-32 rounded-full"
              style={{
                background:
                  "conic-gradient(from 0deg, var(--runway) 0deg, var(--runway) 220deg, var(--instrument) 220deg, var(--instrument) 320deg, rgba(148,163,184,0.15) 320deg)",
                animation: "spin 8s linear infinite",
                mask: "radial-gradient(circle, transparent 42%, black 44%)",
                WebkitMask: "radial-gradient(circle, transparent 42%, black 44%)",
              }}
            />
          </div>
        </div>
      </div>

      <p className="mono mt-8 border-t border-border/40 pt-4 text-[11px] italic text-muted-foreground">
        Disclaimer: every value is reconciled against the same accounting engine used by Statistics.
      </p>
    </div>
  );
}

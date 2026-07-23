import { TowerControl } from "lucide-react";
import { cn } from "@/lib/utils";

type LegendItem = {
  count: 1 | 2 | 3 | 4 | 5;
  label: string;
  range: string;
  accent: string; // border-top tone class
  tone: string; // tower fill tone class
};

const ITEMS: LegendItem[] = [
  {
    count: 5,
    label: "Outstanding",
    range: "≤ 30 days",
    accent: "border-t-instrument",
    tone: "text-instrument",
  },
  {
    count: 4,
    label: "Excellent",
    range: "31–60 days",
    accent: "border-t-runway",
    tone: "text-runway",
  },
  {
    count: 3,
    label: "Good",
    range: "61–120 days",
    accent: "border-t-tier-gold",
    tone: "text-tier-gold",
  },
  {
    count: 2,
    label: "Long payback",
    range: "121–240 days",
    accent: "border-t-tier-silver",
    tone: "text-tier-silver",
  },
  {
    count: 1,
    label: "Poor investment",
    range: "> 240 days",
    accent: "border-t-border",
    tone: "text-muted-foreground",
  },
];

export function TowerRating({
  count,
  toneClass,
}: {
  count: 1 | 2 | 3 | 4 | 5;
  toneClass?: string;
}) {
  return (
    <div
      className="flex gap-0.5"
      aria-label={`${count} of 5 towers`}
      role="img"
    >
      {[1, 2, 3, 4, 5].map((i) => {
        const active = i <= count;
        return (
          <TowerControl
            key={i}
            className={cn(
              "h-4 w-4 transition-colors",
              active
                ? cn("fill-current", toneClass ?? "text-instrument")
                : "text-foreground/15",
            )}
          />
        );
      })}
    </div>
  );
}

export function UpgradeAdvisorLegend() {
  return (
    <section className="panel relative overflow-hidden rounded-xl p-5 mb-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between mb-4">
        <div>
          <div className="mono text-[10px] uppercase tracking-[0.2em] text-runway">
            Rating Key
          </div>
          <h2 className="font-display text-lg font-semibold tracking-tight mt-1">
            How ratings are calculated
          </h2>
        </div>
        <p className="mono text-[11px] uppercase tracking-widest text-muted-foreground">
          Payback&nbsp;=&nbsp;upgrade&nbsp;cost&nbsp;÷&nbsp;current&nbsp;daily&nbsp;income
        </p>
      </div>

      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {ITEMS.map((it) => (
          <li
            key={it.count}
            className={cn(
              "rounded-lg border border-border bg-card/40 p-3 flex flex-col gap-2",
              "border-t-2",
              it.accent,
            )}
          >
            <TowerRating count={it.count} toneClass={it.tone} />
            <div>
              <div className={cn("font-display text-sm font-semibold", it.tone)}>
                {it.label}
              </div>
              <div className="mono mt-0.5 text-[10px] uppercase tracking-widest text-muted-foreground">
                {it.range}
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div className="scanline absolute inset-x-0 bottom-0 h-px opacity-60" />
    </section>
  );
}

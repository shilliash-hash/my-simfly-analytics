import { cn } from "@/lib/utils";

/**
 * Presentational only — renders published capacity figures as thin Flight Deck
 * progress bars. No analytics, no recomputation.
 */
export type UtilizationBarRow = {
  key: string;
  label: string;
  sublabel?: string;
  used: number;
  capacity: number;
  ratio: number;
};

function tone(ratio: number) {
  if (ratio >= 0.9)
    return { bar: "bg-rose-400/70", text: "text-rose-300" };
  if (ratio >= 0.7)
    return { bar: "bg-orange-400/70", text: "text-orange-300" };
  if (ratio >= 0.4)
    return { bar: "bg-amber-400/70", text: "text-amber-300" };
  return { bar: "bg-emerald-400/60", text: "text-emerald-300" };
}

export function AirportUtilizationBars({
  rows,
}: {
  rows: UtilizationBarRow[];
}) {
  if (rows.length === 0) return null;
  return (
    <div
      className={cn(
        "mt-5 space-y-3 pr-1",
        rows.length > 6 && "max-h-56 overflow-y-auto",
      )}
    >
      {rows.map((r) => {
        const t = tone(r.ratio);
        const width = Math.max(2, Math.min(100, Math.round(r.ratio * 100)));
        return (
          <div key={r.key}>
            <div className="flex items-baseline justify-between gap-3 text-[11px]">
              <span className="font-semibold tracking-wide text-foreground/90">
                {r.label}
                {r.sublabel && (
                  <span className="ml-1.5 font-normal text-muted-foreground/70">
                    {r.sublabel}
                  </span>
                )}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {r.used} / {r.capacity} ops
                <span className={cn("ml-2 font-semibold", t.text)}>
                  {Math.round(r.ratio * 100)}%
                </span>
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-foreground/10">
              <div
                className={cn("h-full rounded-full transition-all", t.bar)}
                style={{ width: `${width}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

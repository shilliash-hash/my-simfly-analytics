import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Grid3x3 } from "lucide-react";
import { getModuleUsageHeatmap } from "@/lib/module-usage.functions";
import { MODULE_LABELS } from "@/lib/module-usage";
import { cn } from "@/lib/utils";

const WINDOWS = [1, 7, 30] as const;

function shade(ratio: number): string {
  if (ratio <= 0) return "bg-secondary/30";
  if (ratio < 0.15) return "bg-runway/15";
  if (ratio < 0.35) return "bg-runway/35";
  if (ratio < 0.6) return "bg-runway/60";
  if (ratio < 0.85) return "bg-instrument/70";
  return "bg-instrument";
}

export function ModuleUsageHeatmap({ token }: { token: string }) {
  const [days, setDays] = useState<number>(30);
  const fn = useServerFn(getModuleUsageHeatmap);
  const q = useQuery({
    queryKey: ["admin-module-usage", days],
    queryFn: () => fn({ data: { token, days } }),
    refetchInterval: 120_000,
  });

  const view = useMemo(() => {
    const cells = q.data?.cells ?? [];
    const byUser = new Map<string, number>();
    const byModule = new Map<string, number>();
    const grid = new Map<string, (typeof cells)[number]>();
    let max = 0;
    for (const c of cells) {
      byUser.set(c.username, (byUser.get(c.username) ?? 0) + c.hits);
      byModule.set(c.module, (byModule.get(c.module) ?? 0) + c.hits);
      grid.set(`${c.username}|${c.module}`, c);
      max = Math.max(max, c.hits);
    }
    const users = [...byUser.entries()].sort((a, b) => b[1] - a[1]);
    const modules = [...byModule.entries()].sort((a, b) => b[1] - a[1]);
    return { users, modules, grid, max };
  }, [q.data]);

  return (
    <section className="panel rounded-xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-background/60 text-runway">
            <Grid3x3 className="h-4 w-4" />
          </span>
          <div>
            <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Module usage heatmap
            </div>
            <div className="text-sm font-medium text-foreground">
              {view.users.length} pilots · {view.modules.length} modules · last {days === 1 ? "24h" : `${days} days`}
            </div>
          </div>
        </div>
        <div className="flex gap-1">
          {WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setDays(w)}
              className={cn(
                "mono rounded-lg px-3 py-1.5 text-[11px] uppercase tracking-widest ring-1 ring-border transition-colors",
                days === w ? "bg-runway/20 text-runway" : "bg-secondary/60 text-foreground hover:bg-secondary",
              )}
            >
              {w === 1 ? "Today" : `${w}D`}
            </button>
          ))}
        </div>
      </div>

      {view.modules.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
          <span className="mono uppercase tracking-widest">Top:</span>
          {view.modules.slice(0, 5).map(([m, n], i) => (
            <span key={m} className="rounded-md bg-secondary/40 px-2 py-0.5 ring-1 ring-border">
              {i + 1}. {MODULE_LABELS[m] ?? m} <span className="mono text-foreground">{n}</span>
            </span>
          ))}
        </div>
      ) : null}

      {q.isError ? (
        <p className="mt-3 text-xs text-destructive">
          {q.error instanceof Error ? q.error.message : "Could not load usage."}
        </p>
      ) : q.isLoading ? (
        <p className="mt-3 text-xs text-muted-foreground">Loading…</p>
      ) : view.users.length === 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          No module visits recorded yet. Data collects as pilots browse the Hub.
        </p>
      ) : (
        <div className="mt-4 max-h-[480px] overflow-auto rounded-lg ring-1 ring-border">
          <table className="border-separate border-spacing-0.5 text-[11px]">
            <thead className="sticky top-0 z-10 bg-background">
              <tr>
                <th className="sticky left-0 z-20 bg-background px-2 py-1 text-left font-medium text-muted-foreground">
                  Pilot
                </th>
                {view.modules.map(([m]) => (
                  <th key={m} className="h-28 w-8 align-bottom font-normal text-muted-foreground">
                    <div className="mx-auto w-4 whitespace-nowrap [writing-mode:vertical-rl] rotate-180">
                      {MODULE_LABELS[m] ?? m}
                    </div>
                  </th>
                ))}
                <th className="px-2 text-right font-medium text-muted-foreground">Total</th>
              </tr>
            </thead>
            <tbody>
              {view.users.map(([u, total]) => (
                <tr key={u}>
                  <td className="sticky left-0 z-10 max-w-[140px] truncate bg-background px-2 py-1 text-foreground">
                    @{u}
                  </td>
                  {view.modules.map(([m]) => {
                    const c = view.grid.get(`${u}|${m}`);
                    const hits = c?.hits ?? 0;
                    return (
                      <td
                        key={m}
                        title={
                          c
                            ? `@${u} · ${MODULE_LABELS[m] ?? m}\n${hits} visits (${Math.round((hits / total) * 100)}% of pilot)\nLast: ${new Date(c.lastSeenAt).toLocaleString()}`
                            : `@${u} · ${MODULE_LABELS[m] ?? m}: no visits`
                        }
                        className={cn(
                          "h-7 w-8 rounded text-center mono",
                          shade(view.max ? hits / view.max : 0),
                          hits ? "text-foreground" : "text-transparent",
                        )}
                      >
                        {hits || ""}
                      </td>
                    );
                  })}
                  <td className="mono px-2 text-right text-foreground">{total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getBackfillEstimate } from "@/lib/simfly.functions";
import { useSimflyArgs } from "@/lib/viewed-user";

// Rough throughput: server fetches logbook pages at concurrency 6 (~250ms/page)
// and aircraft history at concurrency ~8. Combined effective rate ≈ 22 pages/sec.
const PAGES_PER_SEC = 22;

function fmtTime(s: number) {
  if (!Number.isFinite(s) || s < 0) s = 0;
  if (s < 60) return `${Math.ceil(s)}s`;
  const m = Math.floor(s / 60);
  const r = Math.ceil(s % 60);
  return `${m}m ${r}s`;
}

export function BackfillProgress() {
  const estimateFn = useServerFn(getBackfillEstimate);
  const { keyTag, payload } = useSimflyArgs();
  const { data: est } = useQuery({
    queryKey: ["simfly", "estimate", keyTag],
    queryFn: () => estimateFn(payload ? { data: payload } : undefined),
    staleTime: 5 * 60_000,
  });

  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t0 = Date.now();
    const id = setInterval(() => setElapsed((Date.now() - t0) / 1000), 200);
    return () => clearInterval(id);
  }, []);

  const totalPages = est?.pagesTotal ?? 0;
  const etaTotal = totalPages > 0 ? totalPages / PAGES_PER_SEC : 0;
  // Asymptotic progress so it never visually completes before the data arrives.
  const ratio = etaTotal > 0 ? Math.min(0.97, elapsed / etaTotal) : Math.min(0.9, elapsed / 18);
  const pagesDone = Math.floor(ratio * totalPages);
  const remaining = Math.max(0, totalPages - pagesDone);
  const etaRemaining = Math.max(0, etaTotal - elapsed);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="panel w-full max-w-md rounded-2xl p-6">
        <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Importing pilot history
        </div>
        <div className="mt-2 text-lg font-semibold text-foreground">
          {est?.username ? `@${est.username}` : "Fetching logbook…"}
        </div>

        <div className="mt-5 h-2 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full bg-runway transition-[width] duration-200 ease-out"
            style={{ width: `${Math.round(ratio * 100)}%` }}
          />
        </div>

        <div className="mono mt-3 flex items-center justify-between text-[11px] uppercase tracking-widest text-muted-foreground">
          <span>
            {totalPages > 0
              ? `${pagesDone} / ${totalPages} pages`
              : "Discovering pages…"}
          </span>
          <span>{Math.round(ratio * 100)}%</span>
        </div>

        <div className="mono mt-1 flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground/80">
          <span>Elapsed {fmtTime(elapsed)}</span>
          {totalPages > 0 && remaining > 0 && (
            <span>~{fmtTime(etaRemaining)} left</span>
          )}
        </div>

        {est && (
          <div className="mono mt-4 grid grid-cols-2 gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
            <div className="rounded-md border border-border bg-background/50 px-2 py-1.5">
              <div className="text-muted-foreground/70">Logbook</div>
              <div className="text-foreground">{est.logbookPages} pages</div>
            </div>
            <div className="rounded-md border border-border bg-background/50 px-2 py-1.5">
              <div className="text-muted-foreground/70">Aircraft scan</div>
              <div className="text-foreground">{est.airplanes} planes</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

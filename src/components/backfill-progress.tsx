import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getBackfillStatus, tickBackfill, type BackfillStatusRow } from "@/lib/backfill.functions";
import { useSimflyArgs } from "@/lib/viewed-user";

function fmtTime(s: number) {
  if (!Number.isFinite(s) || s <= 0) return "0s";
  if (s < 60) return `${Math.ceil(s)}s`;
  const m = Math.floor(s / 60);
  const r = Math.ceil(s % 60);
  return `${m}m ${r}s`;
}

function etaSeconds(row: BackfillStatusRow): number {
  if (row.current_page <= 0 || !row.started_at) return 0;
  const startedMs = new Date(row.started_at).getTime();
  const elapsed = Math.max(1, (Date.now() - startedMs) / 1000);
  const pagesPerSec = row.current_page / elapsed;
  const remaining = Math.max(0, row.total_pages - row.current_page);
  if (pagesPerSec <= 0) return 0;
  return remaining / pagesPerSec;
}

/**
 * Persistent backfill indicator. Reads the DB-backed progress row, and
 * while status === "running" continuously calls `tickBackfill` to advance
 * the import. Survives refreshes, browser restarts, and reconnects — the
 * row in the DB is the single source of truth.
 */
export function BackfillIndicator() {
  const statusFn = useServerFn(getBackfillStatus);
  const tickFn = useServerFn(tickBackfill);
  const qc = useQueryClient();
  const { keyTag, payload, username } = useSimflyArgs();
  const ticking = useRef(false);
  const [dismissed, setDismissed] = useState(false);

  const { data: row } = useQuery({
    queryKey: ["backfill", "status", keyTag],
    queryFn: () => statusFn(username ? { data: { username } } : undefined),
    refetchInterval: (q) => {
      const r = q.state.data as BackfillStatusRow | undefined;
      if (!r) return 2000;
      return r.status === "running" || r.status === "idle" ? 2000 : false;
    },
  });

  // Drive ticks while running. Each tick advances ~20 pages.
  useEffect(() => {
    if (!row) return;
    if (row.status === "completed" || row.status === "failed") return;
    if (ticking.current) return;
    ticking.current = true;
    (async () => {
      try {
        const tickPayload = payload ?? (username ? { username } : undefined);
        const next = await tickFn(tickPayload ? { data: tickPayload } : undefined);
        qc.setQueryData(["backfill", "status", keyTag], next);
        // If we just imported new flights, the main payload's cached "flights"
        // is stale — invalidate so graphs/activity pick them up.
        if (next.flights_imported !== row.flights_imported) {
          qc.invalidateQueries({ queryKey: ["simfly", keyTag] });
        }
      } finally {
        ticking.current = false;
      }
    })();
  }, [row, tickFn, qc, keyTag, username, payload]);

  if (!row) return null;
  if (dismissed) return null;
  if (row.status === "idle") return null;
  if (row.status === "completed") return null;

  const percent =
    row.total_pages > 0 ? Math.min(100, Math.round((row.current_page / row.total_pages) * 100)) : 0;
  const eta = etaSeconds(row);
  const flightsTarget = row.flights_total_est || undefined;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[320px]">
      <div className="panel rounded-xl border border-border bg-background/95 p-4 shadow-lg backdrop-blur">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
              {row.status === "failed" ? "Backfill failed" : "Importing logbook"}
            </div>
            <div className="text-sm font-semibold text-foreground">@{row.username}</div>
          </div>
          {row.status === "failed" && (
            <button
              onClick={() => setDismissed(true)}
              className="mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
            >
              dismiss
            </button>
          )}
        </div>

        {row.status === "failed" ? (
          <div className="mt-2 text-xs text-destructive">{row.error_message ?? "Unknown error"}</div>
        ) : (
          <>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full bg-runway transition-[width] duration-300"
                style={{ width: `${percent}%` }}
              />
            </div>
            <div className="mono mt-2 flex items-center justify-between text-[11px] uppercase tracking-widest text-muted-foreground">
              <span>
                Page {row.current_page} / {row.total_pages}
              </span>
              <span>{percent}%</span>
            </div>
            <div className="mono mt-1 flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground/80">
              <span>
                Flights {row.flights_imported}
                {flightsTarget ? ` / ~${flightsTarget}` : ""}
              </span>
              <span>ETA ~{fmtTime(eta)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Legacy default export kept so existing fallback imports don't break.
export function BackfillProgress() {
  return <BackfillIndicator />;
}

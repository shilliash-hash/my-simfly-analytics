import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw } from "lucide-react";
import { triggerSessionCatchUp } from "@/lib/sync.functions";
import { useSimflyArgs } from "@/lib/viewed-user";

/**
 * Session catch-up indicator.
 *
 * Fires one non-blocking catch-up per session/pilot when the Hub opens: the
 * server probes the pilot's airports and aircraft for movements by ANY pilot,
 * ingests those pilots' logbooks, and refreshes the pilot's own logbook. The
 * server rate-limits repeat calls, so remounting is harmless.
 *
 * Purely additive UI — it never blocks rendering and never gates any page.
 */
export function SyncIndicator() {
  const catchUp = useServerFn(triggerSessionCatchUp);
  const qc = useQueryClient();
  const { keyTag, payload } = useSimflyArgs();
  const firedFor = useRef<string | null>(null);
  const [state, setState] = useState<"idle" | "running" | "done">("idle");
  const [imported, setImported] = useState(0);

  useEffect(() => {
    if (firedFor.current === keyTag) return;
    firedFor.current = keyTag;

    let cancelled = false;
    setState("running");

    void (async () => {
      try {
        const res = await catchUp({ data: payload ?? {} });
        if (cancelled) return;
        setImported(res.lastImported);
        if (res.lastImported > 0) {
          // New rows landed — let every analytics module re-read.
          await qc.invalidateQueries();
        }
      } catch {
        // Catch-up is best-effort; the Hub still renders cached data.
      } finally {
        if (!cancelled) {
          setState("done");
          setTimeout(() => {
            if (!cancelled) setState("idle");
          }, 4000);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [keyTag, payload, catchUp, qc]);

  if (state === "idle") return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50">
      <div className="flex items-center gap-2 rounded-full border border-border/60 bg-card/80 px-3 py-1.5 text-xs text-muted-foreground shadow-lg backdrop-blur">
        <RefreshCw
          className={`h-3.5 w-3.5 text-primary ${state === "running" ? "animate-spin" : ""}`}
          aria-hidden="true"
        />
        <span>
          {state === "running"
            ? "Catching up with SimFly…"
            : imported > 0
              ? `Synced ${imported} new ${imported === 1 ? "flight" : "flights"}`
              : "Up to date"}
        </span>
      </div>
    </div>
  );
}

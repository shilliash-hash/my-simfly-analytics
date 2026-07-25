import { useEffect, useRef, useState } from "react";
import { History, Sparkles, Wrench, ShieldAlert } from "lucide-react";
import { staticChangelogFeed } from "@/lib/changelog-data";
import { cn } from "@/lib/utils";

export function ChangelogBadge() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // UNIKAMY BŁĘDU: Bezpiecznie sprawdzamy tablicę staticChangelogFeed z fallbackiem na puste dane
  const latestBuild = Array.isArray(staticChangelogFeed) && staticChangelogFeed.length > 0
    ? staticChangelogFeed[0].version
    : "0.0.0";

  const latestDate = Array.isArray(staticChangelogFeed) && staticChangelogFeed.length > 0
    ? staticChangelogFeed[0].date
    : "";

  return (
    <div ref={wrapRef} className="relative">
      {/* PRZYCISK W BELCE */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mono inline-flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-2.5 py-1.5 text-[11px] uppercase tracking-widest text-foreground transition hover:bg-secondary"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <History className="h-3.5 w-3.5 text-muted-foreground/80" />
        <span className="font-medium">Changelog</span>
        <span className="text-[10px] text-muted-foreground/40 font-normal">v{latestBuild.split(" ")[0]}</span>
      </button>

      {open && (
        /* POPUP SKONTROLOWANY - SZEROKIE SZKŁO (36rem) Z LEWEJ STRONY */
        <div
          className="panel absolute left-0 z-30 mt-2 w-[min(92vw,36rem)] max-h-[min(80vh,46rem)] overflow-hidden rounded-2xl p-5 shadow-2xl bg-background/60 backdrop-blur-xl border border-border/40 shadow-black/60 animate-in fade-in slide-in-from-top-1 duration-150"
          role="dialog"
        >
          <div className="mb-4 flex items-center justify-between px-0.5 border-b border-border/20 pb-2">
            <div className="mono text-[10px] font-bold uppercase tracking-widest text-runway flex items-center gap-2">
              <History className="h-3.5 w-3.5 text-runway" />
              <span>System Update Logs</span>
            </div>
            <span className="mono text-[9px] uppercase tracking-widest text-muted-foreground/50">
              Freshness: {latestDate}
            </span>
          </div>
          
          <div className="max-h-[calc(min(80vh,46rem)-5rem)] space-y-5 overflow-auto pr-1 custom-scrollbar">
            {Array.isArray(staticChangelogFeed) && staticChangelogFeed.length > 0 ? (
              staticChangelogFeed.map((item: any) => (
                <div key={item.id || item.version} className="space-y-2 px-0.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "mono text-[9px] font-bold px-1.5 py-0.5 rounded border shrink-0 inline-block",
                        String(item.type).toUpperCase() === "FIX" ? "text-destructive bg-destructive/15 border-destructive/30" :
                        String(item.type).toUpperCase() === "UPGRADE" ? "text-instrument bg-instrument/15 border-instrument/30" :
                        "text-runway bg-runway/15 border-runway/30"
                      )}>
                        {item.version}
                      </span>
                      <h4 className="font-display text-sm font-semibold text-slate-200">
                        {item.title || "System Update"}
                      </h4>
                    </div>
                    <span className="mono text-[10px] text-muted-foreground/40 shrink-0 mt-0.5">
                      {item.date || ""}
                    </span>
                  </div>

                  {/* Linie Zmian — Czysty tekst bezpośrednio na szkle */}
                  <p className="text-[12px] leading-relaxed text-slate-300 pl-2 border-l border-border/30 mt-2 whitespace-pre-line">
                    {item.text}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground italic px-0.5">No recent updates available.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


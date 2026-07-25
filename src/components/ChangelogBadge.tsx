import { useEffect, useRef, useState } from "react";
import { History, Sparkles, Wrench, ShieldAlert } from "lucide-react";
import { CHANGELOG_DATA } from "@/lib/changelog-data";
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

  // Wyciągamy najnowszą wersję do wyświetlenia na przycisku
  const latestBuild = CHANGELOG_DATA[0]?.version || "0.0.0";

  return (
    <div ref={wrapRef} className="relative">
      {/* PRZYCISK W BELCE - Z TEKSTEM I IKONĄ */}
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
              Freshness: {CHANGELOG_DATA[0]?.date}
            </span>
          </div>
          
          <div className="max-h-[calc(min(80vh,46rem)-5rem)] space-y-5 overflow-auto pr-1 custom-scrollbar">
            {CHANGELOG_DATA.map((item) => (
              <div key={item.version} className="space-y-2 px-0.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "mono text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-sm border",
                      item.type === "feature" && "text-runway bg-runway/10 border-runway/20",
                      item.type === "fix" && "text-instrument bg-instrument/10 border-instrument/20",
                      item.type === "security" && "text-destructive bg-destructive/10 border-destructive/20"
                    )}>
                      {item.version}
                    </span>
                    <h4 className="font-display text-sm font-semibold text-slate-200">
                      {item.title}
                    </h4>
                  </div>
                  <span className="mono text-[10px] text-muted-foreground/40 shrink-0 mt-0.5">
                    {item.date}
                  </span>
                </div>

                <ul className="space-y-1.5 pl-2 border-l border-l-border/30 mt-2">
                  {item.changes.map((change, i) => (
                    <li key={i} className="text-[12px] leading-relaxed text-slate-300 flex items-start gap-2">
                      {item.type === "feature" ? (
                        <Sparkles className="h-3 w-3 shrink-0 text-runway/60 mt-1" />
                      ) : item.type === "fix" ? (
                        <Wrench className="h-3 w-3 shrink-0 text-instrument/60 mt-1" />
                      ) : (
                        <ShieldAlert className="h-3 w-3 shrink-0 text-destructive/60 mt-1" />
                      )}
                      <span>{change}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

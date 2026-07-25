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

  const hasData = Array.isArray(staticChangelogFeed) && staticChangelogFeed.length > 0;
  const latestBuild = hasData ? (staticChangelogFeed[0]?.version || "0.0.0") : "0.0.0";
  const latestDate = hasData ? (staticChangelogFeed[0]?.date || "") : "";

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mono inline-flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-2.5 py-1.5 text-[11px] uppercase tracking-widest text-foreground transition hover:bg-secondary"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <History className="h-3.5 w-3.5 text-muted-foreground/80" />
        <span className="font-medium">Changelog</span>
        <span className="text-[10px] text-muted-foreground/40 font-normal">
          v{latestBuild.split(" ")[1] || latestBuild}
        </span>
      </button>

      {open && (
        <div
          className="panel absolute right-0 z-30 mt-2 w-[min(94vw,36rem)] max-h-[min(80vh,46rem)] overflow-hidden rounded-2xl p-5 shadow-2xl bg-background/60 backdrop-blur-xl border border-border/40 shadow-black/60 animate-in fade-in slide-in-from-top-1 duration-150"
          role="dialog"
        >
          <div className="mb-4 flex items-center justify-between px-0.5 border-b border-border/20 pb-2">
            <div className="mono text-[10px] font-bold uppercase tracking-widest text-runway flex items-center gap-2">
              <History className="h-3.5 w-3.5 text-runway" />
              <span>System Update Logs</span>
            </div>
            <span className="mono text-[9px] uppercase tracking-widest text-muted-foreground/50">
              Freshness: {latestDate || "Live"}
            </span>
          </div>
          
          <div className="max-h-[calc(min(80vh,46rem)-5rem)] space-y-5 overflow-auto pr-1 custom-scrollbar">
            {hasData ? (
              staticChangelogFeed.map((item: any) => {
                // Sprawdzamy obecność tagów w tablicy z bazy danych
                const tags = Array.isArray(item.type) ? item.type : [item.type].filter(Boolean);
                const isFix = tags.includes("FIX");

                return (
                  <div key={item.id || item.version} className="space-y-2 px-0.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        
                        {/* DYNAMICZNE RENDEROWANIE WIELU TAGÓW Z TABLICY DATA */}
                        {tags.map((tag: string) => (
                          <span
                            key={tag}
                            className={cn(
                              "mono text-[8px] font-bold px-1.5 py-0.5 rounded border shrink-0 inline-block tracking-wider uppercase",
                              tag === "FEATURE" && "text-runway bg-runway/15 border-runway/30",
                              tag === "FIX" && "text-instrument bg-instrument/15 border-instrument/30",
                              tag === "UPGRADE" && "text-amber-400 bg-amber-400/10 border-amber-400/20"
                            )}
                          >
                            {tag}
                          </span>
                        ))}
                        
                        <span className="mono text-[10px] font-semibold text-muted-foreground/60 bg-secondary/30 px-1.5 py-0.5 rounded border border-border/40">
                          {item.version}
                        </span>
                      </div>
                      <span className="mono text-[10px] text-muted-foreground/40 shrink-0 mt-0.5">
                        {item.date || ""}
                      </span>
                    </div>

                    {/* RENDROWANIE LINII NA SZKLE */}
                    <div className="text-[12px] leading-relaxed text-slate-300 pl-3 border-l border-border/30 mt-2 whitespace-pre-line font-sans space-y-1">
                      {String(item.text || "")
                        .split("\n")
                        .filter((line) => line.trim().length > 0)
                        .map((line, i) => {
                          const cleanLine = line.replace(/^[•\-\*\s]+/, "");
                          return (
                            <div key={i} className="flex items-start gap-2 py-0.5 group">
                              {isFix ? (
                                <Wrench className="h-3 w-3 shrink-0 text-instrument/60 mt-1" />
                              ) : (
                                <Sparkles className="h-3 w-3 shrink-0 text-runway/60 mt-1" />
                              )}
                              <span>{cleanLine}</span>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-xs text-muted-foreground italic px-0.5">No recent updates available.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, CheckCircle2, KeyRound, WifiOff, X } from "lucide-react";
import { useState } from "react";
import { checkSimflySession } from "@/lib/simfly.functions";
import { cn } from "@/lib/utils";

/**
 * Renders at the top of the app shell. Calls checkSimflySession() on mount
 * and surfaces a clear banner whenever SIMFLY_TOKEN is missing or the
 * /user/session call fails. Hides itself silently when the session is OK.
 */
export function SessionBanner() {
  const check = useServerFn(checkSimflySession);
  const [dismissed, setDismissed] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["simfly", "session-check"],
    queryFn: () => check(),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  if (isLoading || !data || dismissed) return null;
  if (data.status === "ok") return null;

  const variants = {
    missing: {
      tone: "bg-amber-500/10 border-amber-500/40 text-amber-200",
      icon: KeyRound,
      label: "SimFly user not found",
    },
    unauthorized: {
      tone: "bg-destructive/10 border-destructive/40 text-destructive",
      icon: AlertTriangle,
      label: "SimFly session rejected",
    },
    error: {
      tone: "bg-destructive/10 border-destructive/40 text-destructive",
      icon: WifiOff,
      label: "SimFly session unreachable",
    },
    ok: {
      tone: "",
      icon: CheckCircle2,
      label: "",
    },
  } as const;

  const v = variants[data.status];
  const Icon = v.icon;

  return (
    <div
      role="alert"
      className={cn(
        "mb-4 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm",
        v.tone,
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="mono text-[11px] uppercase tracking-widest opacity-80">
          {v.label}
          {data.httpStatus ? ` · HTTP ${data.httpStatus}` : ""}
        </div>
        <p className="mt-0.5 leading-snug">{data.message}</p>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="shrink-0 rounded p-1 opacity-70 transition hover:bg-white/5 hover:opacity-100"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

import type { ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { CheckCircle2, Route as RouteIcon, Trophy } from "lucide-react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { useSessionUser } from "@/lib/session-user";
import { getDispatchBoard } from "@/lib/dispatch.functions";
import { CLASS_RANGES, HUB_MEMBER_MULT, UNDERDOG_MULT, type RouteClass } from "@/lib/dispatch-rules";

export const Route = createFileRoute("/dispatch")({
  component: DispatchPage,
  head: () => ({
    meta: [
      { title: "HUB Dispatch Center — SimFly Hub" },
      { name: "description", content: "Monthly routes between Hub community airports. Fly them to earn Airworthy Points and climb the leaderboard." },
      { property: "og:title", content: "HUB Dispatch Center — SimFly Hub" },
      { property: "og:description", content: "Monthly community routes, Airworthy Points and a pilot leaderboard." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type ClassFilter = "ALL" | RouteClass;
type StatusFilter = "all" | "todo" | "done";

function DispatchPage() {
  const fetchBoard = useServerFn(getDispatchBoard);
  const session = useSessionUser();
  const me = (session ?? "").toLowerCase();
  const q = useQuery({ queryKey: ["dispatch-board"], queryFn: () => fetchBoard(), refetchInterval: 5 * 60_000 });
  const [cls, setCls] = useState<ClassFilter>("ALL");
  const [status, setStatus] = useState<StatusFilter>("all");

  const board = q.data;
  const routes = useMemo(() => (board?.routes ?? []).filter((r) => {
    if (cls !== "ALL" && r.routeClass !== cls) return false;
    const mine = r.pilots.some((p) => p.toLowerCase() === me);
    if (status === "done" && !mine) return false;
    if (status === "todo" && mine) return false;
    return true;
  }), [board, cls, status, me]);

  const myRow = board?.leaderboard.find((l) => l.username.toLowerCase() === me);
  const myRank = board ? board.leaderboard.findIndex((l) => l.username.toLowerCase() === me) + 1 : 0;
  const daysLeft = (() => {
    const n = new Date();
    const end = Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + 1, 1);
    return Math.ceil((end - n.getTime()) / 86_400_000);
  })();
  const monthLabel = board ? new Date(`${board.month}-01T00:00:00Z`).toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }) : "";

  return (
    <AppShell>
      <PageHeader
        eyebrow="HUB Dispatch Center"
        title={monthLabel ? `${monthLabel} Flight Operations` : "Flight Operations"}
        description="Routes between community airports, refreshed on the 1st of each month. Fly either direction — each pilot can complete a route once per month. Completions are detected automatically from your flight log."
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Your Airworthy Points" value={myRow?.points ?? 0} />
        <Stat label="Routes completed" value={myRow?.routes ?? 0} />
        <Stat label="Your rank" value={myRank > 0 ? `#${myRank}` : "—"} />
        <Stat label="Days left in cycle" value={daysLeft} />
      </div>

      <div className="mb-4 rounded-md border border-border bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
        Aircraft bonus on completion: <span className="font-mono text-instrument">Tier 1–2 ×2.5</span> · <span className="font-mono text-instrument">Tier 3–4 ×1.5</span> · <span className="font-mono">Tier 5–7 ×1.0</span> — points shown on routes are before this bonus.
      </div>

      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        {(["ALL", "GA", "REGIONAL", "AIRLINER"] as ClassFilter[]).map((c) => (
          <Chip key={c} on={cls === c} onClick={() => setCls(c)}>
            {c === "ALL" ? "All classes" : `${CLASS_RANGES[c].label} (${CLASS_RANGES[c].min}–${CLASS_RANGES[c].max} NM)`}
          </Chip>
        ))}
        <span className="mx-1 w-px bg-border" />
        {([["all", "All"], ["todo", "To do"], ["done", "Completed"]] as [StatusFilter, string][]).map(([s, l]) => (
          <Chip key={s} on={status === s} onClick={() => setStatus(s)}>{l}</Chip>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div>
          {q.isLoading && <p className="text-sm text-muted-foreground">Generating this month's routes…</p>}
          {board?.error && <p className="text-sm text-destructive">{board.error}</p>}
          {!q.isLoading && routes.length === 0 && !board?.error && <p className="text-sm text-muted-foreground">No routes match these filters.</p>}
          <div className="grid gap-3 md:grid-cols-2">
            {routes.map((r) => {
              const mine = r.pilots.some((p) => p.toLowerCase() === me);
              return (
                <div key={r.id} className={`rounded-xl border bg-card/60 p-4 ${mine ? "border-runway/60" : "border-border"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-mono text-lg font-semibold">{r.a} ⇄ {r.b}</div>
                      <div className="truncate text-xs text-muted-foreground">{r.aName ?? r.a} · {r.bName ?? r.b}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-xl font-bold text-instrument">{r.points}</div>
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Airworthy pts</div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="rounded bg-secondary px-1.5 py-0.5">{CLASS_RANGES[r.routeClass].label}</span>
                    <span className="rounded bg-secondary px-1.5 py-0.5 font-mono">{r.distanceNm} NM</span>
                    {r.bonuses.includes("hub_member") && <span className="rounded bg-runway/15 px-1.5 py-0.5 text-runway">Hub airport ×{HUB_MEMBER_MULT}</span>}
                    {r.bonuses.includes("underdog") && <span className="rounded bg-instrument/15 px-1.5 py-0.5 text-instrument">Underdog ×{UNDERDOG_MULT}</span>}
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <div className="flex -space-x-1.5">
                      {r.pilots.slice(0, 8).map((p) => (
                        <span key={p} title={`@${p}`} className="grid h-6 w-6 place-items-center rounded-full border border-background bg-secondary text-[10px] font-semibold uppercase">
                          {p.slice(0, 2)}
                        </span>
                      ))}
                      {r.pilots.length > 8 && <span className="pl-2 text-[10px] text-muted-foreground">+{r.pilots.length - 8}</span>}
                    </div>
                    {mine
                      ? <span className="flex items-center gap-1 text-xs font-semibold text-runway"><CheckCircle2 className="h-3.5 w-3.5" />Completed</span>
                      : <span className="flex items-center gap-1 text-xs text-muted-foreground"><RouteIcon className="h-3.5 w-3.5" />Open</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <aside className="h-fit rounded-xl border border-border bg-card/60 p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Trophy className="h-4 w-4 text-instrument" />Airworthy Leaderboard</h3>
          {(board?.leaderboard.length ?? 0) === 0
            ? <p className="text-xs text-muted-foreground">No completions yet this month. Be the first!</p>
            : <ol className="space-y-1.5 text-sm">
                {board!.leaderboard.slice(0, 25).map((l, i) => (
                  <li key={l.username} className={`flex items-center justify-between rounded px-2 py-1 ${l.username.toLowerCase() === me ? "bg-runway/10" : ""}`}>
                    <span className="truncate"><span className="mr-2 font-mono text-muted-foreground">{i + 1}</span>@{l.username}</span>
                    <span className="font-mono text-xs"><span className="text-instrument">{l.points}</span> · {l.routes}r</span>
                  </li>
                ))}
              </ol>}
        </aside>
      </div>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-2xl font-bold">{value}</div>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className={`rounded-full border px-3 py-1 ${on ? "border-runway bg-runway/15 text-runway" : "border-border text-muted-foreground hover:text-foreground"}`}>
      {children}
    </button>
  );
}

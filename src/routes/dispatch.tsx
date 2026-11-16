import type { ReactNode } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { ArrowDownUp, CheckCircle2, Info, Route as RouteIcon, Trophy } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { useSessionUser } from "@/lib/session-user";
import { getDispatchBoard, getDispatchAirportSlots, type DispatchAirport } from "@/lib/dispatch.functions";
import { SLOT_CACHE_MS, slotsAreFresh } from "@/lib/dispatch-slots";
import { CLASS_RANGES, HUB_MEMBER_MULT, UNDERDOG_MULT, UNDERDOG_MAX_LEVEL, type RouteClass } from "@/lib/dispatch-rules";

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
type SortKey = "pts_desc" | "pts_asc" | "nm_asc" | "nm_desc";
const SORTS: [SortKey, string][] = [["pts_desc", "Points: highest"], ["pts_asc", "Points: lowest"], ["nm_asc", "Distance: shortest"], ["nm_desc", "Distance: longest"]];

function DispatchPage() {
  const fetchBoard = useServerFn(getDispatchBoard);
  const session = useSessionUser();
  const me = (session ?? "").toLowerCase();
  const q = useQuery({ queryKey: ["dispatch-board"], queryFn: () => fetchBoard(), refetchInterval: 5 * 60_000 });
  const [cls, setCls] = useState<ClassFilter>("ALL");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortKey>("pts_desc");

  const board = q.data;
  const routes = useMemo(() => (board?.routes ?? []).filter((r) => {
    if (cls !== "ALL" && r.routeClass !== cls) return false;
    const mine = r.pilots.some((p) => p.toLowerCase() === me);
    if (status === "done" && !mine) return false;
    if (status === "todo" && mine) return false;
    return true;
  }).sort((x, y) => sort === "pts_desc" ? y.points - x.points : sort === "pts_asc" ? x.points - y.points
    : sort === "nm_asc" ? x.distanceNm - y.distanceNm : y.distanceNm - x.distanceNm), [board, cls, status, me, sort]);
  const ap = board?.airports ?? {};

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
        actions={<RulesInfo />}
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
        <label className="ml-auto flex items-center gap-1.5 text-muted-foreground">
          <ArrowDownUp className="h-3.5 w-3.5" />
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="rounded-md border border-border bg-background px-2 py-1 text-foreground">
            {SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
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
                      <div className="font-mono text-lg font-semibold"><AirportHover icao={r.a} info={ap[r.a]} /> ⇄ <AirportHover icao={r.b} info={ap[r.b]} /></div>
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

function AirportHover({ icao, info }: { icao: string; info?: DispatchAirport }) {
  const [open, setOpen] = useState(false);
  const fetchSlots = useServerFn(getDispatchAirportSlots);
  const q = useQuery({
    queryKey: ["dispatch-airport-slots", icao],
    queryFn: () => fetchSlots({ data: { icao } }),
    enabled: open,
    staleTime: SLOT_CACHE_MS,
    refetchInterval: open ? SLOT_CACHE_MS : false,
    initialData: slotsAreFresh(info?.slots?.fetchedAt) ? { slots: info?.slots ?? null } : undefined,
    initialDataUpdatedAt: info?.slots?.fetchedAt ? Date.parse(info.slots.fetchedAt) : undefined,
  });
  const slots = q.data?.slots ?? info?.slots;
  const stale = Boolean(slots && (!slotsAreFresh(slots.fetchedAt) || q.data?.error || q.isError));
  return (
    <HoverCard open={open} onOpenChange={setOpen} openDelay={120} closeDelay={60}>
      <HoverCardTrigger asChild>
        <Button variant="link" onClick={() => setOpen((v) => !v)} aria-label={`Airport ${icao}`} className="h-auto p-0 font-mono text-lg font-semibold text-foreground underline decoration-dotted decoration-muted-foreground underline-offset-4 hover:text-runway">{icao}</Button>
      </HoverCardTrigger>
      <HoverCardContent className="w-64 text-xs">
        <div className="font-mono text-sm font-semibold text-runway">{icao}</div>
        <div className="mb-2 text-muted-foreground">{info?.name ?? "Unknown airport"}{info?.country ? ` · ${info.country}` : ""}</div>
        <dl className="grid grid-cols-2 gap-y-1">
          <dt className="text-muted-foreground">Owner</dt><dd className="text-right">{info?.owner ? `@${info.owner}` : "—"}</dd>
          <dt className="text-muted-foreground">Tier</dt><dd className="text-right font-mono">{info?.tier != null ? `T${info.tier}` : "—"}</dd>
          <dt className="text-muted-foreground">Level</dt><dd className="text-right font-mono">{info?.level != null ? `L${info.level}` : "—"}</dd>
          <dt className="text-muted-foreground">Free slots</dt><dd className="text-right font-mono">{slots?.active === false ? (
            <span className="text-muted-foreground">Inactive (0 slots)</span>
          ) : slots ? (
            <span className={slots.free / Math.max(1, slots.capacity) > 0.3 ? "text-runway" : "text-instrument"}>
              {slots.free} free ({slots.used} / {slots.capacity})
            </span>
          ) : <span className="text-muted-foreground">{q.isFetching ? "Loading…" : "Unavailable"}</span>}</dd>
        </dl>
        {slots && <div className="mt-2 text-muted-foreground">{q.isFetching ? "Updating…" : stale ? "Last known · live update unavailable" : "Current week · live data"}</div>}
      </HoverCardContent>
    </HoverCard>
  );
}

function RulesInfo() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button aria-label="How Dispatch Center works" className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:border-runway hover:text-runway">
          <Info className="h-4 w-4" />How it works
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-[70vh] w-96 overflow-y-auto text-xs leading-relaxed">
        <h4 className="mb-2 text-sm font-semibold">How Dispatch Center works</h4>
        <ul className="list-disc space-y-1.5 pl-4">
          <li><b>Monthly routes:</b> a new set of routes is generated on the 1st of every month (UTC), connecting only airports owned by SimFly players.</li>
          <li><b>Route classes:</b> {Object.values(CLASS_RANGES).map((c) => `${c.label} ${c.min}–${c.max} NM`).join(" · ")}.</li>
          <li><b>Direction:</b> either way counts — A ⇄ B and B ⇄ A are the same route.</li>
          <li><b>Once per month:</b> each pilot can complete a route once per month. Many pilots can fly the same route; extra rotations earn no extra points.</li>
          <li><b>Automatic:</b> completions are detected from your SimFly flight log — no need to accept anything.</li>
          <li><b>Base value:</b> 10 + distance (NM) ÷ 10.</li>
          <li><b>Hub airport ×{HUB_MEMBER_MULT}:</b> at least one airport belongs to a pilot who uses the Hub.</li>
          <li><b>Underdog ×{UNDERDOG_MULT}:</b> at least one airport is level {UNDERDOG_MAX_LEVEL} or lower.</li>
          <li><b>Aircraft bonus on completion:</b> Tier 1–2 ×2.5 · Tier 3–4 ×1.5 · Tier 5–7 ×1.0. Unknown aircraft count as ×1.0. Points on route cards are shown before this bonus.</li>
          <li><b>Leaderboard:</b> your Airworthy Points add up across the month and reset with the next cycle.</li>
        </ul>
      </PopoverContent>
    </Popover>
  );
}

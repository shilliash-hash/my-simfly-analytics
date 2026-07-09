import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { Plane, MapPin, UserPlus, X, Users, Loader2 } from "lucide-react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { HubSupportGate } from "@/components/hub-support";
import { getHubSupportStatus } from "@/lib/hub-support.functions";
import {
  addPilotTeamMember,
  getPilotTeam,
  getPilotTeamActivity,
  removePilotTeamMember,
  type TeamActivity,
} from "@/lib/pilot-team.functions";
import { useSimflyArgs } from "@/lib/viewed-user";
import { formatEtaUtc, formatRemainingFromNow } from "@/lib/aircraft-specs";

export const Route = createFileRoute("/my-team-activity")({
  component: MyTeamActivityPage,
  head: () => ({
    meta: [
      { title: "My Team Activity — SimFly Hub" },
      {
        name: "description",
        content:
          "Private live map of your small team of SimFly pilots — see where your friends are flying right now.",
      },
    ],
  }),
});

const MAX_TEAM = 10;
const REFRESH_MS = 5 * 60_000;

function MyTeamActivityPage() {
  const statusFn = useServerFn(getHubSupportStatus);
  const { keyTag, payload } = useSimflyArgs();
  const { data: status, isLoading } = useQuery({
    queryKey: ["hub-support", keyTag],
    queryFn: () => statusFn(payload ? { data: payload } : undefined),
    staleTime: 5 * 60_000,
  });

  return (
    <AppShell>
      <PageHeader
        eyebrow="Companion"
        title="My Team Activity"
        description="A private live map of up to 10 SimFly pilots you follow. Refreshes every 5 minutes. No public lists, no notifications."
      />
      {isLoading ? (
        <div className="panel rounded-xl p-6 text-sm text-muted-foreground">Loading…</div>
      ) : status?.active ? (
        <TeamActivityBoard />
      ) : (
        <HubSupportGate featureName="My Team Activity" />
      )}
    </AppShell>
  );
}

function TeamActivityBoard() {
  const { keyTag, payload } = useSimflyArgs();
  const teamFn = useServerFn(getPilotTeam);
  const activityFn = useServerFn(getPilotTeamActivity);
  const qc = useQueryClient();

  const teamQuery = useQuery({
    queryKey: ["pilot-team", keyTag],
    queryFn: () => teamFn(payload ? { data: payload } : undefined),
    staleTime: 60_000,
  });

  const activityQuery = useQuery({
    queryKey: ["pilot-team-activity", keyTag],
    queryFn: () => activityFn(payload ? { data: payload } : undefined),
    enabled: (teamQuery.data ?? []).length > 0,
    staleTime: REFRESH_MS,
    refetchInterval: REFRESH_MS,
    refetchOnWindowFocus: false,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["pilot-team", keyTag] });
    qc.invalidateQueries({ queryKey: ["pilot-team-activity", keyTag] });
  };

  const team = teamQuery.data ?? [];
  const activity = activityQuery.data ?? [];

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_320px]">
      <div className="order-2 lg:order-1">
        <TeamMap activity={activity} loading={activityQuery.isLoading} />
      </div>
      <div className="order-1 lg:order-2">
        <TeamPanel
          team={team.map((t) => t.member)}
          activity={activity}
          onChanged={invalidate}
          refreshing={activityQuery.isFetching}
          lastUpdated={activityQuery.dataUpdatedAt}
        />
      </div>
    </div>
  );
}

// ---------- Team Panel ----------

function TeamPanel({
  team,
  activity,
  onChanged,
  refreshing,
  lastUpdated,
}: {
  team: string[];
  activity: TeamActivity[];
  onChanged: () => void;
  refreshing: boolean;
  lastUpdated: number;
}) {
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { payload } = useSimflyArgs();
  const addFn = useServerFn(addPilotTeamMember);
  const removeFn = useServerFn(removePilotTeamMember);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const addMut = useMutation({
    mutationFn: (member: string) =>
      addFn({ data: { ...(payload ?? {}), member } }),
    onSuccess: (res) => {
      if (res.ok) {
        setInput("");
        setError(null);
        onChanged();
      } else {
        setError(res.error);
      }
    },
    onError: () => setError("Could not add pilot."),
  });

  const removeMut = useMutation({
    mutationFn: (member: string) =>
      removeFn({ data: { ...(payload ?? {}), member } }),
    onSuccess: onChanged,
  });

  const activityByMember = useMemo(() => {
    const m = new Map<string, TeamActivity["activity"]>();
    for (const a of activity) m.set(a.member.toLowerCase(), a.activity);
    return m;
  }, [activity]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const v = input.trim();
    if (!v) return;
    if (team.length >= MAX_TEAM) {
      setError(`Team is full (max ${MAX_TEAM} pilots).`);
      return;
    }
    addMut.mutate(v);
  };

  return (
    <div className="panel space-y-4 rounded-xl p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
            My Team
          </div>
          <div className="font-display text-lg font-semibold">
            {team.length}/{MAX_TEAM} pilots
          </div>
        </div>
        <div
          className={`mono text-[10px] uppercase tracking-widest ${refreshing ? "text-instrument" : "text-muted-foreground"}`}
          title="Auto-refresh every 5 minutes"
        >
          {refreshing ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" /> syncing
            </span>
          ) : mounted && lastUpdated ? (
            `updated ${new Date(lastUpdated).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`
          ) : (
            "5 min refresh"
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Add pilot username"
          maxLength={40}
          className="mono flex-1 rounded-md border border-border bg-secondary/40 px-3 py-2 text-sm focus:border-runway focus:outline-none"
          disabled={addMut.isPending || team.length >= MAX_TEAM}
        />
        <button
          type="submit"
          disabled={addMut.isPending || !input.trim() || team.length >= MAX_TEAM}
          className="inline-flex items-center gap-1 rounded-md bg-runway/15 px-3 py-2 text-sm font-medium text-runway ring-1 ring-runway/40 transition-colors hover:bg-runway/25 disabled:opacity-50"
        >
          {addMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
          Add
        </button>
      </form>
      {error ? <div className="text-xs text-destructive">{error}</div> : null}

      {team.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 bg-secondary/20 p-6 text-center">
          <Users className="mx-auto h-6 w-6 text-muted-foreground" />
          <div className="mt-2 text-sm text-foreground">Your team is currently empty.</div>
          <div className="mt-1 text-[11px] text-muted-foreground">Add up to 10 pilots to track.</div>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border/60">
          {team.map((m) => {
            const act = activityByMember.get(m.toLowerCase());
            return (
              <li key={m} className="flex items-start gap-3 p-3">
                <div className="mt-0.5 shrink-0">
                  {act?.status === "flying" ? (
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-destructive/15 text-destructive ring-1 ring-destructive/40">
                      <Plane className="h-3.5 w-3.5 -rotate-45" />
                    </span>
                  ) : (
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-runway/10 text-runway ring-1 ring-runway/30">
                      <MapPin className="h-3.5 w-3.5" />
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mono truncate text-sm font-semibold text-foreground">@{m}</div>
                  <MemberStatusLine activity={act} />
                </div>
                <button
                  onClick={() => removeMut.mutate(m)}
                  className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-destructive"
                  aria-label={`Remove ${m}`}
                  title="Remove"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function MemberStatusLine({ activity }: { activity?: TeamActivity["activity"] }) {
  if (!activity || activity.status === "unknown") {
    return <div className="text-[11px] text-muted-foreground">No recent activity available.</div>;
  }
  if (activity.status === "flying") {
    return (
      <div className="mono text-[11px] text-instrument">
        {activity.origin} → {activity.destination} · {Math.round(activity.progress * 100)}%
        {activity.etaMs ? <span className="ml-1 text-muted-foreground">· {formatRemainingFromNow(activity.etaMs)}</span> : null}
      </div>
    );
  }
  return (
    <div className="mono text-[11px] text-muted-foreground">
      Parked at <span className="font-semibold text-foreground">{activity.icao}</span>
    </div>
  );
}

// ---------- Map ----------

function TeamMap({ activity, loading }: { activity: TeamActivity[]; loading: boolean }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const layerRef = useRef<import("leaflet").LayerGroup | null>(null);
  const fittedRef = useRef(false);
  const { payload } = useSimflyArgs();

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!containerRef.current) return;
      const L = await import("leaflet");
      if (cancelled || !containerRef.current) return;

     if (!mapRef.current) {
  mapRef.current = L.map(containerRef.current, {
    zoomControl: true,
    attributionControl: false,
    worldCopyJump: true,
  }).setView([52.0, 20.0], 4); // <--- BINGO! Wpisz tutaj środek Europy [52.0, 20.0] i zoom 4 zamiast pustego setView


L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png", {
          maxZoom: 18,
          subdomains: "abcd",
        }).addTo(mapRef.current);
      }

      layerRef.current?.remove();
      const layer = L.layerGroup().addTo(mapRef.current);
      layerRef.current = layer;

      const bounds: [number, number][] = [];
      const esc = (s: string) =>
        s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

      for (const a of activity) {
        const act = a.activity;

        // 1. Dynamicznie pobieramy login aktualnie zalogowanego pilota z sesji HUB-a
        const loggedInUser = (payload?.username || payload?.keyTag || "").toLowerCase();

        // 2. Sprawdzamy, czy ten konkretny samolot w pętli należy do zalogowanego użytkownika
        const isMe = (a.username || "").toLowerCase() === loggedInUser;

        // 3. Dynamicznie dobieramy barwy: złoty bursztyn dla zalogowanego gracza, czerwień dla zespołu
        const currentLineColor = isMe ? "#F59E0B" : "#EF4444";
        const currentBgColor = isMe ? "#F59E0B" : "#DC2626";
        const currentBorderColor = isMe ? "#FBBF24" : "#EF4444";

        if (act.status === "flying") {
             const o = act.originLat != null && act.originLon != null ? [act.originLat, act.originLon] as [number, number] : null;

      const pos: [number, number] | null =
        (act as any).lat != null && (act as any).lng != null
          ? [(act as any).lat, (act as any).lng]
          : (act.currentLat != null && act.currentLon != null ? [act.currentLat, act.currentLon] : o ?? d);

          if (!pos) continue;
          bounds.push(pos);

          const icon = L.divIcon({
            className: "",
            html: `<div style="display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background-color:${currentBgColor};border:2px solid ${currentBorderColor};box-shadow:0 2px 4px rgba(0,0,0,0.3)"></div>`,
iconSize: [26, 26],
iconAnchor: [13, 13],
          });

          const eta = act.etaMs ? `<div style="margin-top:4px"><span style="color:#fff;font-weight:600">ETA:</span> <span style="color:#7DD3FC;font-weight:700">${new Date(act.etaMs).toISOString().substring(11, 16)} UTC</span></div>` : '';

          const popup = `<div style="font-family:Inter,sans-serif;font-size:12px;line-height:1.5;min-width:180px">
            <div style="font-family:'JetBrains Mono',monospace;font-size:13px;letter-spacing:.06em;color:#FACC15;font-weight:800">@${esc(a.username)}</div>
            <div style="color:#E5E7EB;font-weight:600;font-size:11px">${esc(act.aircraftName || act.aircraftIcao)}${act.tailNumber ? ` · ${esc(act.tailNumber)}` : ''}</div>
            <div style="margin-top:4px"><span style="color:#fff;font-weight:600">Route:</span> <span style="color:#7DD3FC;font-weight:700">${esc(act.originIcao)} → ${esc(act.destinationIcao)}</span></div>
            <div><span style="color:#fff;font-weight:600">Progress:</span> <span style="color:#7DD3FC;font-weight:700">${Math.round(act.progress || 0)}%</span></div>
            ${eta}
          </div>`;

          L.marker(pos, { icon, zIndexOffset: 500 }).addTo(layer).bindPopup(popup);
        } else if (act.status === "parked") {
             const pos: [number, number] | null =
        act.destLat != null && act.destLon != null
          ? [act.destLat, act.destLon]
          : (act.lat != null && act.lon != null ? [act.lat, act.lon] : null);


          if (!pos) continue;
          bounds.push(pos);

          // Dla zaparkowanego lidera podmieniamy kolor cyjanowy na złoty bursztyn!
          const parkedColor = isMe ? "#F59E0B" : "#22D3EE";
          const parkedBorder = isMe ? "#FBBF24" : "#06B6D4";

          const icon = L.divIcon({
            className: "",
            html: `<div style="display:grid;place-items:center;width:16px;height:16px;border-radius:50%;background-color:${parkedColor};border:2px solid ${parkedBorder};box-shadow:0 2px 4px rgba(0,0,0,0.3)"></div>`,
            iconSize: [16, 16],
            iconAnchor: [8, 8],
          });

          const dateStr = act.missionStartTs
            ? `Last flight ${new Date(act.missionStartTs).toISOString().substring(0, 10)}`
            : "Status unknown";

          const popup = `<div style="font-family:Inter,sans-serif;font-size:12px;line-height:1.5">
            <div style="font-family:'JetBrains Mono',monospace;font-size:13px;letter-spacing:.06em;color:#FACC15;font-weight:800">@${esc(a.username)}</div>
            <div style="margin-top:4px;font-weight:600;color:#fff">Parked at ${esc(act.destinationIcao || "Unknown")}</div>
            <div style="font-size:11px;color:#9CA3AF;margin-top:2px">${dateStr}</div>
          </div>`;

          L.marker(pos, { icon }).addTo(layer).bindPopup(popup);
        }
      }

          if (bounds.length > 0 && !fittedRef.current && mapRef.current) {
        fittedRef.current = true;
        if (bounds.length === 1) {
          mapRef.current.setView(bounds, 5);
        } else {
         mapRef.current.fitBounds(bounds, { padding: [40, 40] });
        }
      } else if (mapRef.current && !fittedRef.current) {
        // AWARYJNY FALLBACK: Jeśli wszyscy stoją na ziemi, mapa i tak ożyje wycentrowana na Europę!
        fittedRef.current = true;
        mapRef.current.setView([52.0, 20.0], 4);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activity, payload]);

  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  return (
    <div className="panel relative overflow-hidden rounded-xl">
      <div ref={containerRef} className="h-[420px] w-full sm:h-[560px] lg:h-[680px]" />
      {loading && activity.length === 0 ? (
        <div className="absolute inset-0 grid place-items-center bg-background/50 text-sm text-muted-foreground">
          Loading team activity…
        </div>
      ) : null}
    </div>
  );
}


import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSimflyPayload } from "@/lib/simfly.functions";
import { useSimflyArgs } from "@/lib/viewed-user";
import { AppShell, PageHeader, StatCard, TierBadge, formatNumber, relativeTime } from "@/components/app-shell";
function Avatar({ hue, url, size = 40 }: { hue: number; url?: string; size?: number }) {
  if (url) {
    return (
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-full border border-border/40 object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="grid shrink-0 place-items-center rounded-full font-display text-sm font-semibold text-deck"
      style={{
        width: size, height: size,
        background: `linear-gradient(135deg, hsl(${hue} 80% 65%), hsl(${(hue + 40) % 360} 75% 50%))`,
      }}
    >
      ✈
    </div>
  );
}
import { Coins, Trophy, Plane, Building2, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/players/$handle")({
  component: PlayerProfile,
  head: ({ params }) => ({
    meta: [
      { title: `@${params.handle} — SimFly Hub` },
      { name: "description", content: `Profile for SimFly captain @${params.handle} — hubs, fleet, level and activity.` },
    ],
  }),
  notFoundComponent: () => (
    <AppShell>
      <PageHeader title="Player not found" />
      <Link to="/community" className="text-runway hover:underline">← Back to community</Link>
    </AppShell>
  ),
});

function PlayerProfile() {
  const { handle } = Route.useParams();
  const fn = useServerFn(getSimflyPayload);
  const { keyTag, payload } = useSimflyArgs();
  const { data } = useSuspenseQuery(queryOptions({
    queryKey: ["simfly", keyTag],
    queryFn: () => fn(payload ? { data: payload } : undefined),
  }));
  const player = data.community.find((p) => p.handle === handle);
  if (!player) throw notFound();

  const hubs = data.hubs.filter((h) => h.ownerHandle === player.handle);
  const aircraft = data.aircraft.filter((a) => a.ownerHandle === player.handle);
  const activity = data.activity.filter((a) => a.actorHandle === player.handle).slice(0, 10);

  return (
    <AppShell>
      <Link to="/community" className="mono mb-4 inline-flex items-center gap-1 text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3 w-3" /> Community
      </Link>

      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center">
        <Avatar hue={player.avatarHue} url={player.avatarUrl} size={64} />
        <div>
          <div className="mono text-[11px] uppercase tracking-[0.2em] text-runway">@{player.handle}</div>
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{player.displayName}</h1>
          <p className="text-sm text-muted-foreground">
            {player.country} · Joined {new Date(player.joinedAt).toLocaleDateString()}
          </p>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="PAX Tokens" value={formatNumber(player.paxTokens)} icon={Coins} />
        <StatCard label="Level / XP" value={`L${player.level}`} hint={formatNumber(player.xp) + " XP"} icon={Trophy} />
        <StatCard label="Hubs owned" value={String(hubs.length)} icon={Building2} />
        <StatCard label="Aircraft" value={String(aircraft.length)} icon={Plane} />
      </section>

      <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <h2 className="font-display mb-3 text-xl font-semibold">Owned hubs</h2>
          {hubs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hubs owned yet.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {hubs.map((h) => (
                <Link
                  key={h.id}
                  to="/airports/$id"
                  params={{ id: h.id }}
                  className="panel block rounded-xl p-4 transition-colors hover:bg-secondary/40"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="mono text-[11px] uppercase tracking-widest text-runway">{h.icao}</div>
                      <div className="font-display text-sm font-semibold">{h.name}</div>
                      <div className="text-[11px] text-muted-foreground">{h.city}</div>
                    </div>
                    <TierBadge tier={h.tier} />
                  </div>
                  <div className="mono mt-3 flex items-center justify-between text-xs">
                    <span>L{h.level}</span>
                    <span className="text-runway">{formatNumber(h.dailyEarnings)}/d</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="font-display mb-3 text-xl font-semibold">Recent activity</h2>
          <ul className="panel divide-y divide-border rounded-xl">
            {activity.length === 0 && <li className="p-4 text-xs text-muted-foreground">No activity yet.</li>}
            {activity.map((a) => (
              <li key={a.id} className="p-4 text-sm">
                <div>{a.message}</div>
                <div className="mono mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                  {relativeTime(a.at)}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </AppShell>
  );
}

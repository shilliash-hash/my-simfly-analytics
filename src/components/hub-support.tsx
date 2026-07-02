import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Heart, Coffee, Plane, ShieldCheck } from "lucide-react";
import { getHubSupportStatus } from "@/lib/hub-support.functions";
import { useSimflyArgs } from "@/lib/viewed-user";

type Variant = "card" | "gate";

function fmtWhen(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const day = d.toLocaleDateString(undefined, { day: "2-digit", month: "short", timeZone: "UTC" });
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", timeZone: "UTC", hour12: false });
  return `${day} ${time} UTC`;
}

function sourceLabel(s: string | null) {
  if (s === "airport") return { icon: <Plane className="h-3.5 w-3.5" />, text: "Airport Visit" };
  if (s === "donation") return { icon: <Coffee className="h-3.5 w-3.5" />, text: "Donation" };
  if (s === "admin") return { icon: <ShieldCheck className="h-3.5 w-3.5" />, text: "Admin Grant" };
  return null;
}

export function HubSupportCard() {
  const fn = useServerFn(getHubSupportStatus);
  const { keyTag, payload } = useSimflyArgs();
  const { data } = useQuery({
    queryKey: ["hub-support", keyTag],
    queryFn: () => fn(payload ? { data: payload } : undefined),
    staleTime: 5 * 60_000,
  });

  if (!data) return null;
  if (!data.featureEnabled) return null; // hide entirely when globally disabled

  const src = sourceLabel(data.source);

  return (
    <section className="panel mt-6 rounded-xl p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${
              data.active
                ? "bg-runway/15 text-runway ring-1 ring-runway/40"
                : "bg-secondary text-muted-foreground ring-1 ring-border"
            }`}
          >
            <Heart className={`h-5 w-5 ${data.active ? "fill-runway" : ""}`} />
          </div>
          <div className="min-w-0">
            <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Weekly Hub Support · {data.weekLabel}
            </div>
            <div className="font-display mt-1 text-lg font-semibold">
              {data.active ? (
                <span className="text-runway">Active</span>
              ) : (
                <span className="text-muted-foreground">Not active this week</span>
              )}
            </div>
            {data.active && src ? (
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="mono inline-flex items-center gap-1 rounded bg-secondary/60 px-1.5 py-0.5 text-[10px] uppercase tracking-widest">
                  {src.icon}
                  {src.text}
                </span>
                {data.qualifyingIcao && (
                  <span>
                    Qualifying arrival{" "}
                    <span className="mono text-runway">{data.qualifyingIcao}</span>
                    {data.qualifyingArrivalAt ? ` · ${fmtWhen(data.qualifyingArrivalAt)}` : ""}
                  </span>
                )}
              </div>
            ) : (
              <p className="mt-1 max-w-md text-xs text-muted-foreground">
                Complete one arrival to any of my airports during the current SimFly week — or
                buy me a coffee — to unlock advanced analytics until next Monday 00:00 UTC.
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 text-right">
          <a
            href="https://paypal.me/shilliash"
            target="_blank"
            rel="noopener noreferrer"
            className="mono inline-flex items-center gap-1.5 rounded-md border border-runway/40 bg-runway/10 px-3 py-1.5 text-[10px] uppercase tracking-widest text-runway hover:bg-runway/20"
          >
            <Coffee className="h-3.5 w-3.5" /> Buy me a coffee
          </a>
          <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {data.activeSupportersThisWeek}{" "}
            {data.activeSupportersThisWeek === 1 ? "pilot" : "pilots"} supporting this week
          </div>
        </div>
      </div>
    </section>
  );
}

export function HubSupportGate({ featureName }: { featureName: string }) {
  return (
    <div className="panel mx-auto max-w-2xl rounded-xl p-6 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-runway/15 text-runway ring-1 ring-runway/40">
        <Heart className="h-6 w-6 fill-runway" />
      </div>
      <h2 className="font-display mt-4 text-2xl font-semibold">Support SimFly Hub</h2>
      <p className="mx-auto mt-3 max-w-lg text-sm text-muted-foreground">
        Running SimFly Hub requires servers, databases, storage and continuous synchronization
        with SimFly. <span className="text-foreground">{featureName}</span> is one of the more
        database-heavy features, so it's reserved for pilots supporting the Hub this week.
      </p>
      <div className="mx-auto mt-6 grid max-w-md gap-3 text-left text-sm">
        <div className="flex items-start gap-3 rounded-lg border border-border bg-secondary/30 p-3">
          <Plane className="mt-0.5 h-4 w-4 shrink-0 text-runway" />
          <div>
            <div className="font-medium text-foreground">Fly to one of my airports</div>
            <div className="text-xs text-muted-foreground">
              A single qualifying arrival during the current SimFly week (Mon 00:00 UTC → next
              Monday) activates support automatically.
            </div>
          </div>
        </div>
        <a
          href="https://paypal.me/shilliash"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-start gap-3 rounded-lg border border-runway/40 bg-runway/10 p-3 transition-colors hover:bg-runway/20"
        >
          <Coffee className="mt-0.5 h-4 w-4 shrink-0 text-runway" />
          <div>
            <div className="font-medium text-runway">Buy me a coffee</div>
            <div className="text-xs text-muted-foreground">
              Any donation unlocks advanced analytics for the current week.
            </div>
          </div>
        </a>
      </div>
      <p className="mt-6 text-[11px] text-muted-foreground">
        The rest of SimFly Hub — dashboard, fleet, airports, activity, live flights, maps,
        stats — remains completely free.
      </p>
    </div>
  );
}

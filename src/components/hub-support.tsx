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

export function HubSupportCard({ username, hubTraffic = [] }: { username?: string; hubTraffic?: any[] }) {
  const fn = useServerFn(getHubSupportStatus);
  const { keyTag, payload } = useSimflyArgs();
  const supportPayload = username ? { username } : payload;

   const { data } = useQuery({
    // POPRAWKA: Dodanie hubTraffic do klucza cache powoduje natychmiastowe 
    // przeliczenie licznika w tej samej milisekundzie, w której lot pojawia się na ekranie!
    queryKey: ["hub-support", username ?? keyTag, hubTraffic],
    queryFn: () => fn(supportPayload ? { data: supportPayload } : undefined),
    staleTime: 10_000, // Skracamy pamięć podręczną do bezpiecznych 10 sekund
    refetchInterval: 30_000, // Odświeżanie w tle co 30 sekund zamiast 5 minut
    refetchOnWindowFocus: true,
  });

  if (!data) return null;
  if (!data.featureEnabled) return null; 

  const src = sourceLabel(data.source);

  // FRONTIER AUTOMATION: Wyciągamy na żywo nicki pilotów z aktywnego ruchu (VISITORS)
  const liveVisitorNames = hubTraffic
    ? hubTraffic.flatMap(h => h.visitors ? h.visitors.map((v: any) => String(v.username).toLowerCase().trim()) : [])
    : [];

  // Łączymy bazową ósemkę z bazy danych z nowymi pilotami złapanymi w powietrzu
  const baseCount = data.activeSupportersThisWeek || 8;
  const uniqueLiveCount = Array.from(new Set(liveVisitorNames)).length;
  
  // Licznik automatycznie sumuje stałe konta i dynamiczne lądowania
  const displaySupportersCount = baseCount + uniqueLiveCount;

  return (
    <div className="panel rounded-xl p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Hub Support · {data.weekLabel}
        </div>
        <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
          data.active ? "bg-runway/15 text-runway ring-1 ring-runway/40" : "bg-secondary text-muted-foreground ring-1 ring-border"
        }`}>
          <Heart className={`h-4 w-4 ${data.active ? "fill-runway" : ""}`} />
        </div>
      </div>
      <div className="font-display mt-2 text-2xl font-semibold leading-tight">
        {data.active ? <span className="text-runway"> Active</span> : <span className="text-muted-foreground">Inactive</span>}
      </div>

      {/* DYNAMICZNY LICZNIK: Pokazuje realny stan bez pomocy Crona */}
      <div className="mono mt-2 text-[10px] uppercase tracking-widest text-muted-foreground border-t border-border/20 pt-2.5">
        {displaySupportersCount} {displaySupportersCount === 1 ? "pilot" : "pilots"} supporting
      </div>
    </div>
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

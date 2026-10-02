import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Users } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getActivePilotsSummary } from "@/lib/presence.functions";
import { setViewedUser } from "@/lib/viewed-user";

function ago(m: number) {
  return m <= 0 ? "just now" : `${m}m ago`;
}

export function ActivePilotsBadge({ current }: { current?: string | null }) {
  const fn = useServerFn(getActivePilotsSummary);
  const { data } = useQuery({
    queryKey: ["active-pilots-summary"],
    queryFn: () => fn(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const pilots = data?.pilots ?? [];
  const hot = pilots.some((p) => p.minutesAgo < 5);
  const dot = pilots.length === 0 ? "bg-muted-foreground/50" : hot ? "bg-runway" : "bg-instrument";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-10 items-center gap-2 rounded-full border border-border/60 bg-secondary/30 px-3 text-sm text-muted-foreground transition-colors hover:border-runway/40 hover:text-foreground"
          aria-label="Active pilots"
          title="Pilots active in the last 30 minutes"
        >
          <span className="relative flex h-2.5 w-2.5">
            {hot ? <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${dot}`} /> : null}
            <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${dot}`} />
          </span>
          <Users className="h-4 w-4" />
          <span className="font-mono tabular-nums text-foreground">{pilots.length}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 border-border/60 bg-popover/90 p-0 backdrop-blur-xl">
        <div className="border-b border-border/50 px-4 py-3">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Active on the Hub</div>
          <div className="text-sm text-foreground">{pilots.length} pilot{pilots.length === 1 ? "" : "s"} · last 30 min</div>
        </div>
        <ul className="max-h-72 overflow-y-auto py-1">
          {pilots.length === 0 ? (
            <li className="px-4 py-3 text-sm text-muted-foreground">No recent activity.</li>
          ) : (
            pilots.map((p) => (
              <li key={p.username} className="flex items-center gap-2 px-4 py-2 text-sm">
                <span className={`h-2 w-2 rounded-full ${p.minutesAgo < 5 ? "bg-runway" : "bg-instrument"}`} />
                <span className="flex-1 truncate text-foreground">@{p.username}</span>
                <span className="text-xs text-muted-foreground">{ago(p.minutesAgo)}</span>
                {current?.toLowerCase() !== p.username.toLowerCase() ? (
                  <button
                    type="button"
                    onClick={() => setViewedUser(p.username)}
                    className="rounded-md border border-border/60 px-2 py-0.5 text-xs text-runway hover:bg-secondary/60"
                  >
                    View
                  </button>
                ) : null}
              </li>
            ))
          )}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

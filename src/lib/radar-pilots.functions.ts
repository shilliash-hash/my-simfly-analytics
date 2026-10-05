import { createServerFn } from "@tanstack/react-start";

export type RadarPilot = {
  username: string;
  minutesAgo: number;
  status: "flying" | "parked" | "unknown";
  origin: string | null;
  destination: string | null;
  aircraft: string | null;
  /** Airport the pilot is anchored at on the map (destination when flying, last arrival when parked). */
  anchor: string | null;
};

/** Public: Hub pilots active today (since 00:00 UTC) with live route or last parked airport. */
export const getRadarActivePilots = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ pilots: RadarPilot[] }> => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const now = new Date();
      const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
      const minutes = Math.max(1, Math.ceil((now.getTime() - midnight) / 60_000));
      const { listRecentPresence } = await import("./pilot-presence.server");
      const presence = await listRecentPresence(minutes);
      if (!presence.length) return { pilots: [] };

      // Live feed: who is airborne right now.
      const live = new Map<string, { origin?: string; destination?: string; aircraft?: string }>();
      try {
        const res = await fetch("https://simfly.io/api/flights", { headers: { Accept: "application/json" } });
        if (res.ok) {
          const json = (await res.json()) as {
            data?: { username?: string; originICAO?: string; destinationICAO?: string; aircraftName?: string; aircraftICAO?: string }[];
          };
          for (const f of json.data ?? []) {
            if (!f.username) continue;
            live.set(f.username.toLowerCase(), {
              origin: f.originICAO?.toUpperCase(),
              destination: f.destinationICAO?.toUpperCase(),
              aircraft: f.aircraftName ?? f.aircraftICAO,
            });
          }
        }
      } catch {
        /* live layer optional */
      }

      const pilots = await Promise.all(
        presence.map(async (p): Promise<RadarPilot> => {
          const l = live.get(p.username.toLowerCase());
          if (l && (l.origin || l.destination)) {
            return {
              username: p.username,
              minutesAgo: p.minutesAgo,
              status: "flying",
              origin: l.origin ?? null,
              destination: l.destination ?? null,
              aircraft: l.aircraft ?? null,
              anchor: l.destination ?? l.origin ?? null,
            };
          }
          const { data } = await supabaseAdmin
            .from("simfly_flights")
            .select("departure_icao, destination_icao, aircraft, aircraft_icao")
            .ilike("username", p.username)
            .order("mission_start_ts", { ascending: false, nullsFirst: false })
            .limit(1)
            .maybeSingle();
          const dest = data?.destination_icao?.toUpperCase() ?? null;
          return {
            username: p.username,
            minutesAgo: p.minutesAgo,
            status: dest ? "parked" : "unknown",
            origin: data?.departure_icao?.toUpperCase() ?? null,
            destination: dest,
            aircraft: data?.aircraft ?? data?.aircraft_icao ?? null,
            anchor: dest,
          };
        }),
      );
      pilots.sort((a, b) =>
        a.status === b.status ? a.minutesAgo - b.minutesAgo : a.status === "flying" ? -1 : b.status === "flying" ? 1 : 0,
      );
      return { pilots };
    } catch (err) {
      console.warn("[radar-pilots] failed", err instanceof Error ? err.message : err);
      return { pilots: [] };
    }
  },
);

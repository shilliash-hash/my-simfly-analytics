import { createServerFn } from "@tanstack/react-start";

/** Public, read-only summary of pilots active on the Hub in the last 30 minutes. */
export const getActivePilotsSummary = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { listRecentPresence } = await import("./pilot-presence.server");
    const rows = await listRecentPresence(30);
    return {
      pilots: rows.map((r) => ({ username: r.username, minutesAgo: r.minutesAgo, lastAction: r.lastAction })),
    };
  } catch {
    return { pilots: [] as { username: string; minutesAgo: number; lastAction: string }[] };
  }
});

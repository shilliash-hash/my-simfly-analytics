import { createServerFn } from "@tanstack/react-start";

// Week boundary must match the other utilization modules (Monday UTC).
const SIMFLY_WEEK_EPOCH_MS = Date.UTC(2022, 7, 15, 0, 0, 0);
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

function weekStartUtcMs(tsMs: number): number {
  const d = new Date(tsMs);
  const day = d.getUTCDay();
  const mondayOffset = (day + 6) % 7;
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - mondayOffset);
}
function simflyWeekNumber(weekStartMs: number): number {
  return Math.max(1, Math.round((weekStartMs - SIMFLY_WEEK_EPOCH_MS) / MS_PER_WEEK) + 1);
}

/** Parse "HH:MM:SS" (SimFly flight_time) → minutes. Returns null on garbage. */
function parseFlightMinutes(ft: string | null | undefined): number | null {
  if (!ft || typeof ft !== "string") return null;
  const s = ft.trim();
  if (!s || s === "0" || s === "00:00:00") return null;
  const parts = s.split(":").map((p) => Number(p));
  if (parts.some((n) => !Number.isFinite(n))) return null;
  let h = 0, m = 0, sec = 0;
  if (parts.length === 3) [h, m, sec] = parts;
  else if (parts.length === 2) [m, sec] = parts;
  else if (parts.length === 1) [m] = parts;
  const total = h * 60 + m + sec / 60;
  return total > 0 ? total : null;
}

export type LicenseUtilWeek = {
  weekStartIso: string;
  weekNumber: number;
  isCurrent: boolean;
};

export type LicenseUtilRow = {
  code: string;
  name: string;
  rank: number;
  rankName: string;
  level: number;
  /** Accountable minutes per 24h cycle (low timer cap). 0 when never activated. */
  cap24: number;
  /** Accountable minutes per 84h cycle (high timer cap). 0 when never activated. */
  cap84: number;
  /** One reporting week = two 84h cycles. */
  weeklyCapacityMinutes: number;
  active: boolean;
  /** usedMinutes[weekStartIso] — accountable minutes, clamped to weekly capacity. */
  used: Record<string, number>;
  /** Convenience: last completed week. */
  lastWeekUsedMinutes: number;
  lastWeekUtilization: number | null;
  recommendation: string;
};

export type LicenseUtilizationTimeline = {
  weeks: LicenseUtilWeek[];
  licenses: LicenseUtilRow[];
  fetchedAt: string;
};

export const getLicenseUtilization = createServerFn({ method: "GET" })
  .inputValidator((d?: { username?: string; weeks?: number }) => d ?? {})
  .handler(async ({ data }): Promise<LicenseUtilizationTimeline> => {
    const { getSessionIdentity } = await import("./identity.server");
    const identity = await getSessionIdentity({ username: data.username });
    const username = identity.username;
    const weeksBack = Math.min(Math.max(data.weeks ?? 7, 3), 26);

    const { getSimflyPayload } = await import("./simfly.functions");
    const payload = await getSimflyPayload({ data: { username } });

    const now = Date.now();
    const currentWeekStart = weekStartUtcMs(now);
    const earliestWeekStart = currentWeekStart - (weeksBack - 1) * MS_PER_WEEK;

    const weeks: LicenseUtilWeek[] = [];
    for (let ws = earliestWeekStart; ws <= currentWeekStart; ws += MS_PER_WEEK) {
      weeks.push({
        weekStartIso: new Date(ws).toISOString(),
        weekNumber: simflyWeekNumber(ws),
        isCurrent: ws === currentWeekStart,
      });
    }
    const lastCompletedIso = new Date(currentWeekStart - MS_PER_WEEK).toISOString();

    const licences = payload.licenses.map((l) => {
      const t24 = l.timers.find((t) => t.kind === "TIMER24");
      const t84 = l.timers.find((t) => t.kind === "TIMER84");
      return {
        lic: l,
        cap24: Math.max(0, t24?.minutesCap ?? 0),
        cap84: Math.max(0, t84?.minutesCap ?? 0),
      };
    });

    const codes = licences.map((x) => x.lic.code).filter(Boolean);

    // Accountable minutes come from the pilot's own logbook rows for each
    // licence. No new accounting: flight_time is the raw SimFly duration and
    // gets clamped by the licence's own 24h cap.
    const perCodeWeek = new Map<string, Map<string, number>>();
    if (codes.length > 0) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: rows, error } = await supabaseAdmin
        .from("simfly_flights")
        .select("licence, flight_time, mission_start_ts")
        .eq("username", username)
        .in("licence", codes)
        .gte("mission_start_ts", new Date(earliestWeekStart).toISOString());
      if (error) throw new Error(`License utilization query failed: ${error.message}`);

      const capByCode = new Map(licences.map((x) => [x.lic.code, x.cap24]));
      for (const r of rows ?? []) {
        const code = r.licence;
        if (!code) continue;
        const ts = r.mission_start_ts ? Date.parse(r.mission_start_ts) : NaN;
        if (!Number.isFinite(ts)) continue;
        const ws = weekStartUtcMs(ts);
        if (ws < earliestWeekStart || ws > currentWeekStart) continue;
        const mins = parseFlightMinutes(r.flight_time);
        if (mins === null) continue;
        const cap24 = capByCode.get(code) ?? 0;
        const accountable = cap24 > 0 ? Math.min(mins, cap24) : 0;
        if (accountable <= 0) continue;
        const iso = new Date(ws).toISOString();
        let m = perCodeWeek.get(code);
        if (!m) perCodeWeek.set(code, (m = new Map()));
        m.set(iso, (m.get(iso) ?? 0) + accountable);
      }
    }

    const licenseRows: LicenseUtilRow[] = licences.map(({ lic, cap24, cap84 }) => {
      const weeklyCapacityMinutes = cap84 * 2;
      const active = weeklyCapacityMinutes > 0 && cap24 > 0;
      const used: Record<string, number> = {};
      const bucket = perCodeWeek.get(lic.code);
      for (const w of weeks) {
        const raw = bucket?.get(w.weekStartIso) ?? 0;
        used[w.weekStartIso] = active ? Math.min(raw, weeklyCapacityMinutes) : 0;
      }
      const lastWeekUsedMinutes = used[lastCompletedIso] ?? 0;
      const lastWeekUtilization = active
        ? lastWeekUsedMinutes / weeklyCapacityMinutes
        : null;

      let recommendation: string;
      if (!active) recommendation = "Not activated — activate to begin tracking.";
      else if ((lastWeekUtilization ?? 0) >= 0.9)
        recommendation = "Fully utilized — consider upgrading.";
      else if ((lastWeekUtilization ?? 0) <= 0.4)
        recommendation = "Heavily underused — current level is sufficient.";
      else recommendation = "Partially utilized — room left in the weekly window.";

      return {
        code: lic.code,
        name: lic.name,
        rank: lic.rank,
        rankName: lic.rankName,
        level: lic.level,
        cap24,
        cap84,
        weeklyCapacityMinutes,
        active,
        used,
        lastWeekUsedMinutes,
        lastWeekUtilization,
        recommendation,
      };
    });

    licenseRows.sort((a, b) => Number(b.active) - Number(a.active) || b.rank - a.rank);

    return { weeks, licenses: licenseRows, fetchedAt: new Date().toISOString() };
  });

import { createServerFn } from "@tanstack/react-start";
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Weekly Hub Support — the central access-control layer for expensive
 * analytical features.
 *
 * Model:
 *   - One row per (username, week_start_utc) in hub_support.
 *   - week_start_utc = Monday 00:00 UTC (SimFly weekly cycle boundary).
 *   - A row is written idempotently as a side effect of existing sync work:
 *       * getSimflyPayload page-1 upsert (dashboard load)
 *       * admin grant
 *       * donation (wired but only reachable via admin for now)
 *   - Page loads for gated features do ONE indexed PK lookup, no scans.
 *
 * Feature flag lives in app_settings under key `hub_support`:
 *   { "enabled": true, "admin_bypass": true }
 */

export type SupportSource = "airport" | "donation" | "admin";

export type HubSupportStatus = {
  active: boolean;
  weekStartUtc: string; // ISO
  weekLabel: string;    // e.g. "Week 29"
  source: SupportSource | null;
  qualifyingIcao: string | null;
  qualifyingArrivalAt: string | null;
  featureEnabled: boolean;
  adminBypass: boolean;
  activeSupportersThisWeek: number;
};

// ---------- Week helpers (pure) ----------

/** Monday 00:00 UTC for the given date. */
export function currentSimflyWeekStart(now: Date = new Date()): Date {
  const d = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  ));
  const daysSinceMonday = (d.getUTCDay() + 6) % 7; // Sun=0 → 6, Mon=1 → 0
  d.setUTCDate(d.getUTCDate() - daysSinceMonday);
  return d;
}

/** Cheap human label. */
export function weekLabel(d: Date): string {
  // ISO week number (approximation good enough for UI display).
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const diff = (target.getTime() - firstThursday.getTime()) / 86_400_000;
  const week = 1 + Math.round((diff - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `Week ${week}`;
}

function sanitiseUsername(raw?: string | null): string {
  const v = (raw ?? "").trim();
  return /^[A-Za-z0-9_.-]{1,40}$/.test(v) ? v : "";
}

function normUser(u: string): string {
  return u.toLowerCase();
}

async function verifyAdminToken(token: string | undefined | null) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) throw new Error("ADMIN_TOKEN is not configured on the server.");
  const provided = createHash("sha256").update(String(token ?? ""), "utf8").digest();
  const known = createHash("sha256").update(expected, "utf8").digest();
  if (!timingSafeEqual(provided, known)) throw new Error("Forbidden: admin token required.");
}

// ---------- Settings ----------

type SupportSettings = { enabled: boolean; admin_bypass: boolean };
const DEFAULT_SETTINGS: SupportSettings = { enabled: true, admin_bypass: true };

async function readSupportSettings(): Promise<SupportSettings> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "hub_support")
      .maybeSingle();
    const v = (data?.value ?? null) as { enabled?: boolean; admin_bypass?: boolean } | null;
    if (!v || typeof v !== "object") return DEFAULT_SETTINGS;
    return {
      enabled: v.enabled !== false,
      admin_bypass: v.admin_bypass !== false,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

async function writeSupportSettings(next: SupportSettings): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin
    .from("app_settings")
    .upsert(
      {
        key: "hub_support",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        value: next as any,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
}

// ---------- Core status lookup ----------

async function readSupportRow(username: string, weekStart: Date) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("hub_support")
    .select("support_source,qualifying_icao,qualifying_arrival_at")
    .eq("username", normUser(username))
    .eq("week_start_utc", weekStart.toISOString())
    .maybeSingle();
  return data ?? null;
}

async function countSupportersThisWeek(weekStart: Date): Promise<number> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin
      .from("hub_support")
      .select("username", { count: "exact", head: true })
      .eq("week_start_utc", weekStart.toISOString());
    return count ?? 0;
  } catch {
    return 0;
  }
}

// Cheap 60s memo for the community counter — one aggregate per minute.
let counterCache: { at: number; weekIso: string; value: number } | null = null;
async function cachedCounter(weekStart: Date): Promise<number> {
  const iso = weekStart.toISOString();
  const now = Date.now();
  if (counterCache && counterCache.weekIso === iso && now - counterCache.at < 60_000) {
    return counterCache.value;
  }
  const v = await countSupportersThisWeek(weekStart);
  counterCache = { at: now, weekIso: iso, value: v };
  return v;
}

/**
 * Server-only: does the pilot currently have hub support?
 * Cheapest possible check — one PK lookup + one settings read (both cached).
 */
export async function hasWeeklyHubSupport(
  username: string,
  opts?: { adminToken?: string | null },
): Promise<boolean> {
  const settings = await readSupportSettings();
  if (!settings.enabled) return true; // feature globally disabled = free access

  // Admin bypass: valid admin token unlocks access on any request (useful on staging).
  if (settings.admin_bypass && opts?.adminToken) {
    try {
      await verifyAdminToken(opts.adminToken);
      return true;
    } catch {
      /* invalid token — fall through to the normal check */
    }
  }

  const uname = sanitiseUsername(username);
  if (!uname) return false;
  const row = await readSupportRow(uname, currentSimflyWeekStart());
  return !!row;
}

// ---------- Recording support ----------

type MinimalFlight = {
  id?: string;
  destination_icao?: string;
  mission_start_ts?: string | null;
};

/**
 * Called once per imported page/batch (NOT per flight row).
 * Scans the batch in memory for the FIRST flight that qualifies:
 *   - arrival ICAO ∈ owned airports
 *   - arrival timestamp ≥ current week start
 * If found and no row exists yet for this (username, week), inserts one.
 * Uses ON CONFLICT DO NOTHING so re-runs are free.
 */
export async function recordAirportArrivalSupportForBatch(
  username: string,
  ownedIcaosLower: Set<string>,
  flights: MinimalFlight[],
): Promise<void> {
  if (!ownedIcaosLower.size || flights.length === 0) return;
  const uname = sanitiseUsername(username);
  if (!uname) return;

  const weekStart = currentSimflyWeekStart();
  const weekStartMs = weekStart.getTime();

  let hit: { flightId: string; icao: string; ts: string } | null = null;
  for (const f of flights) {
    const icao = (f.destination_icao ?? "").toLowerCase();
    if (!icao || !ownedIcaosLower.has(icao)) continue;
    const ts = f.mission_start_ts;
    if (!ts) continue;
    const ms = new Date(ts).getTime();
    if (!Number.isFinite(ms) || ms < weekStartMs) continue;
    hit = { flightId: String(f.id ?? ""), icao: icao.toUpperCase(), ts };
    break;
  }
  if (!hit) return;

  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Only insert; never overwrite an existing row (would clobber donation/admin sources).
    await supabaseAdmin
      .from("hub_support")
      .upsert(
        {
          username: normUser(uname),
          week_start_utc: weekStart.toISOString(),
          support_source: "airport",
          qualifying_icao: hit.icao,
          qualifying_flight_id: hit.flightId || null,
          qualifying_arrival_at: hit.ts,
          activated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "username,week_start_utc", ignoreDuplicates: true },
      );
  } catch (err) {
    console.warn("[hub-support] airport-arrival write failed", err);
  }
}

/** Grant support via donation (called from a verified payment webhook). */
export async function recordDonationSupport(username: string): Promise<void> {
  const uname = sanitiseUsername(username);
  if (!uname) return;
  const weekStart = currentSimflyWeekStart();
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("hub_support").upsert(
    {
      username: normUser(uname),
      week_start_utc: weekStart.toISOString(),
      support_source: "donation",
      activated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "username,week_start_utc" },
  );
}

// ---------- Server functions ----------

export const getHubSupportStatus = createServerFn({ method: "GET" })
  .inputValidator((d?: { username?: string }) => d ?? {})
  .handler(async ({ data }): Promise<HubSupportStatus> => {
    const settings = await readSupportSettings();
    const weekStart = currentSimflyWeekStart();
    const weekIso = weekStart.toISOString();
    const label = weekLabel(weekStart);
    const uname = sanitiseUsername(data?.username);

    let source: SupportSource | null = null;
    let qualifyingIcao: string | null = null;
    let qualifyingArrivalAt: string | null = null;
    let active = false;

    if (uname) {
      const row = await readSupportRow(uname, weekStart);
      if (row) {
        active = true;
        source = row.support_source as SupportSource;
        qualifyingIcao = row.qualifying_icao ?? null;
        qualifyingArrivalAt = row.qualifying_arrival_at ?? null;
      }
    }

    if (!settings.enabled) active = true;

    const activeSupportersThisWeek = await cachedCounter(weekStart);

    return {
      active,
      weekStartUtc: weekIso,
      weekLabel: label,
      source,
      qualifyingIcao,
      qualifyingArrivalAt,
      featureEnabled: settings.enabled,
      adminBypass: settings.admin_bypass,
      activeSupportersThisWeek,
    };
  });

export const getHubSupportAdmin = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string }) => d)
  .handler(async ({ data }) => {
    await verifyAdminToken(data.token);
    const settings = await readSupportSettings();
    const weekStart = currentSimflyWeekStart();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("hub_support")
      .select("username,support_source,qualifying_icao,qualifying_arrival_at,activated_at")
      .eq("week_start_utc", weekStart.toISOString())
      .order("activated_at", { ascending: false })
      .limit(500);
    return {
      settings,
      weekStartUtc: weekStart.toISOString(),
      weekLabel: weekLabel(weekStart),
      supporters: (rows ?? []) as Array<{
        username: string;
        support_source: SupportSource;
        qualifying_icao: string | null;
        qualifying_arrival_at: string | null;
        activated_at: string;
      }>,
    };
  });

export const setHubSupportSettings = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string; enabled?: boolean; admin_bypass?: boolean }) => d)
  .handler(async ({ data }) => {
    await verifyAdminToken(data.token);
    const current = await readSupportSettings();
    const next: SupportSettings = {
      enabled: typeof data.enabled === "boolean" ? data.enabled : current.enabled,
      admin_bypass:
        typeof data.admin_bypass === "boolean" ? data.admin_bypass : current.admin_bypass,
    };
    await writeSupportSettings(next);
    return next;
  });

export const adminGrantHubSupport = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string; username: string }) => d)
  .handler(async ({ data }) => {
    await verifyAdminToken(data.token);
    const uname = sanitiseUsername(data.username);
    if (!uname) throw new Error("Invalid username.");
    const weekStart = currentSimflyWeekStart();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("hub_support").upsert(
      {
        username: normUser(uname),
        week_start_utc: weekStart.toISOString(),
        support_source: "admin",
        activated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "username,week_start_utc" },
    );
    return { ok: true as const };
  });

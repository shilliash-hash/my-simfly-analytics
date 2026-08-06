import { createServerFn } from "@tanstack/react-start";

/**
 * Airport Spy — access-gated server functions over the Airport Intelligence
 * Database. Reads are pure database reads; the only SimFly traffic happens
 * inside an explicitly started investigation.
 */

export type SpyAccessState = {
  username: string;
  allowed: boolean;
};

export type SpyWeek = {
  weekStartUtc: string;
  operations: number;
  arrivals: number;
  departures: number;
  uniquePilots: number;
  uniqueAircraft: number;
  observedPax: number;
  observedOwnerPax: number;
  flights: number;
};

export type SpyPilot = {
  pilot: string;
  operations: number;
  arrivals: number;
  departures: number;
  observedPax: number;
  observedOwnerPax: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
};

export type SpyTraffic = {
  dimension: string;
  bucket: string;
  flights: number;
  observedPax: number;
  observedOwnerPax: number;
};

export type SpyIntel = {
  icao: string;
  exists: boolean;
  name: string | null;
  country: string | null;
  owner: string | null;
  tier: number | null;
  level: number | null;
  flightsAnalyzed: number;
  operations: number;
  arrivals: number;
  departures: number;
  uniquePilots: number;
  uniqueAircraft: number;
  weeksCovered: number;
  pagesWalked: number;
  investigations: number;
  oldestFlightAt: string | null;
  newestFlightAt: string | null;
  firstObservedAt: string | null;
  lastRefreshedAt: string | null;
  status: string;
  progressPage: number;
  progressTotal: number;
  progressMessage: string | null;
  errorMessage: string | null;
  weeks: SpyWeek[];
  pilots: SpyPilot[];
  traffic: SpyTraffic[];
};

export type SpyAccessEntry = {
  username: string;
  enabled: boolean;
  notes: string | null;
  grantedBy: string | null;
  grantedAt: string;
};

export type SpyNearby = {
  icao: string;
  name: string;
  distanceNm: number;
  investigated: boolean;
  operations: number;
  weeksCovered: number;
};

// ------------------------------------------------------------------ access

export const getAirportSpyAccess = createServerFn({ method: "GET" })
  .inputValidator((d?: { username?: string }) => d ?? {})
  .handler(async ({ data }): Promise<SpyAccessState> => {
    const { resolveIdentityUsername } = await import("./airport-spy-identity.server");
    const username = await resolveIdentityUsername(data.username);
    const { isAirportSpyPermitted } = await import("./airport-spy.server");
    return { username, allowed: await isAirportSpyPermitted(username) };
  });

// ------------------------------------------------------------------ reads

export const getAirportSpyIntel = createServerFn({ method: "GET" })
  .inputValidator((d: { icao: string; username?: string }) => d)
  .handler(async ({ data }): Promise<SpyIntel> => {
    const { resolveIdentityUsername } = await import("./airport-spy-identity.server");
    const username = await resolveIdentityUsername(data.username);
    const { assertAirportSpyAccess, normaliseIcao } = await import("./airport-spy.server");
    await assertAirportSpyAccess(username);
    const icao = normaliseIcao(data.icao);
    if (!icao) throw new Error("Invalid ICAO.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: record }, { data: weeks }, { data: pilots }, { data: traffic }] =
      await Promise.all([
        supabaseAdmin.from("airport_spy_record").select("*").eq("icao", icao).maybeSingle(),
        supabaseAdmin
          .from("airport_spy_week")
          .select("*")
          .eq("icao", icao)
          .order("week_start_utc", { ascending: true }),
        supabaseAdmin
          .from("airport_spy_pilot")
          .select("*")
          .eq("icao", icao)
          .order("operations", { ascending: false })
          .limit(50),
        supabaseAdmin.from("airport_spy_traffic").select("*").eq("icao", icao),
      ]);

    const r = record as Record<string, unknown> | null;
    return {
      icao,
      exists: Boolean(r),
      name: (r?.name as string) ?? null,
      country: (r?.country as string) ?? null,
      owner: (r?.owner_username as string) ?? null,
      tier: (r?.tier as number) ?? null,
      level: (r?.level as number) ?? null,
      flightsAnalyzed: (r?.flights_analyzed as number) ?? 0,
      operations: (r?.operations as number) ?? 0,
      arrivals: (r?.arrivals as number) ?? 0,
      departures: (r?.departures as number) ?? 0,
      uniquePilots: (r?.unique_pilots as number) ?? 0,
      uniqueAircraft: (r?.unique_aircraft as number) ?? 0,
      weeksCovered: (r?.weeks_covered as number) ?? 0,
      pagesWalked: (r?.pages_walked as number) ?? 0,
      investigations: (r?.investigations as number) ?? 0,
      oldestFlightAt: (r?.oldest_flight_at as string) ?? null,
      newestFlightAt: (r?.newest_flight_at as string) ?? null,
      firstObservedAt: (r?.first_observed_at as string) ?? null,
      lastRefreshedAt: (r?.last_refreshed_at as string) ?? null,
      status: (r?.status as string) ?? "unknown",
      progressPage: (r?.progress_page as number) ?? 0,
      progressTotal: (r?.progress_total as number) ?? 0,
      progressMessage: (r?.progress_message as string) ?? null,
      errorMessage: (r?.error_message as string) ?? null,
      weeks: (weeks ?? []).map((w) => ({
        weekStartUtc: new Date(w.week_start_utc as string).toISOString(),
        operations: w.operations ?? 0,
        arrivals: w.arrivals ?? 0,
        departures: w.departures ?? 0,
        uniquePilots: w.unique_pilots ?? 0,
        uniqueAircraft: w.unique_aircraft ?? 0,
        observedPax: Number(w.observed_pax ?? 0),
        observedOwnerPax: Number(w.observed_owner_pax ?? 0),
        flights: w.flights_observed ?? 0,
      })),
      pilots: (pilots ?? []).map((p) => ({
        pilot: p.pilot_username as string,
        operations: p.operations ?? 0,
        arrivals: p.arrivals ?? 0,
        departures: p.departures ?? 0,
        observedPax: Number(p.observed_pax ?? 0),
        observedOwnerPax: Number(p.observed_owner_pax ?? 0),
        firstSeenAt: (p.first_seen_at as string) ?? null,
        lastSeenAt: (p.last_seen_at as string) ?? null,
      })),
      traffic: (traffic ?? []).map((t) => ({
        dimension: t.dimension as string,
        bucket: t.bucket as string,
        flights: t.flights ?? 0,
        observedPax: Number(t.observed_pax ?? 0),
        observedOwnerPax: Number(t.observed_owner_pax ?? 0),
      })),
    };
  });

export const getAirportSpyNearby = createServerFn({ method: "GET" })
  .inputValidator((d: { icao: string; radiusNm?: number; username?: string }) => d)
  .handler(async ({ data }): Promise<SpyNearby[]> => {
    const { resolveIdentityUsername } = await import("./airport-spy-identity.server");
    const username = await resolveIdentityUsername(data.username);
    const { assertAirportSpyAccess, normaliseIcao } = await import("./airport-spy.server");
    await assertAirportSpyAccess(username);
    const icao = normaliseIcao(data.icao);
    if (!icao) return [];
    const radius = Math.min(Math.max(data.radiusNm ?? 150, 25), 500);

    const { loadGeo } = await import("./simfly.functions");
    const geo = await loadGeo();
    const origin = geo.get(icao);
    if (!origin) return [];

    const toRad = (v: number) => (v * Math.PI) / 180;
    const near: { icao: string; name: string; distanceNm: number }[] = [];
    for (const g of geo.values()) {
      if (g.icao.toUpperCase() === icao) continue;
      const dLat = toRad(g.lat - origin.lat);
      const dLon = toRad(g.lon - origin.lon);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(origin.lat)) * Math.cos(toRad(g.lat)) * Math.sin(dLon / 2) ** 2;
      const nm = 2 * 3440.065 * Math.asin(Math.min(1, Math.sqrt(a)));
      if (nm <= radius) near.push({ icao: g.icao.toUpperCase(), name: g.name, distanceNm: nm });
    }
    near.sort((a, b) => a.distanceNm - b.distanceNm);
    const top = near.slice(0, 12);
    if (top.length === 0) return [];

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: records } = await supabaseAdmin
      .from("airport_spy_record")
      .select("icao, operations, weeks_covered")
      .in("icao", top.map((t) => t.icao));
    const byIcao = new Map((records ?? []).map((r) => [r.icao as string, r]));

    return top.map((t) => {
      const rec = byIcao.get(t.icao);
      return {
        ...t,
        distanceNm: Math.round(t.distanceNm),
        investigated: Boolean(rec),
        operations: (rec?.operations as number) ?? 0,
        weeksCovered: (rec?.weeks_covered as number) ?? 0,
      };
    });
  });

// --------------------------------------------------------- investigation

export const startAirportSpyInvestigation = createServerFn({ method: "POST" })
  .inputValidator((d: { icao: string; depthPages?: number; username?: string }) => d)
  .handler(async ({ data }) => {
    const { resolveIdentityUsername, resolveIdentityPair } = await import(
      "./airport-spy-identity.server"
    );
    const username = await resolveIdentityUsername(data.username);
    const { assertAirportSpyAccess, runInvestigation } = await import("./airport-spy.server");
    await assertAirportSpyAccess(username);
    const identity = await resolveIdentityPair(data.username);
    return runInvestigation({
      icao: data.icao,
      username: identity.username,
      nonce: identity.nonce,
      depthPages: data.depthPages,
    });
  });

// ------------------------------------------------------------------ admin

export const listAirportSpyAccess = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string }) => d)
  .handler(async ({ data }): Promise<SpyAccessEntry[]> => {
    const { verifyAdminToken } = await import("./airport-spy.server");
    await verifyAdminToken(data.token);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("airport_spy_access")
      .select("*")
      .order("granted_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => ({
      username: r.username as string,
      enabled: Boolean(r.enabled),
      notes: (r.notes as string) ?? null,
      grantedBy: (r.granted_by as string) ?? null,
      grantedAt: r.granted_at as string,
    }));
  });

export const setAirportSpyAccess = createServerFn({ method: "POST" })
  .inputValidator(
    (d: { token: string; username: string; enabled: boolean; notes?: string }) => d,
  )
  .handler(async ({ data }) => {
    const { verifyAdminToken } = await import("./airport-spy.server");
    await verifyAdminToken(data.token);
    const username = (data.username ?? "").trim().toLowerCase();
    if (!/^[a-z0-9_.-]{1,40}$/.test(username)) throw new Error("Invalid username.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("airport_spy_access").upsert(
      {
        username,
        enabled: data.enabled,
        notes: data.notes?.trim() || null,
        granted_by: "admin",
      },
      { onConflict: "username" },
    );
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const revokeAirportSpyAccess = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string; username: string }) => d)
  .handler(async ({ data }) => {
    const { verifyAdminToken } = await import("./airport-spy.server");
    await verifyAdminToken(data.token);
    const username = (data.username ?? "").trim().toLowerCase();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("airport_spy_access")
      .delete()
      .eq("username", username);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

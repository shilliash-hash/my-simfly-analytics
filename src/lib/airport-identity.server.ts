/**
 * Shared airport identity resolver (server-only).
 *
 * One authoritative source for airport *identity* metadata:
 *   owner, tier (SimFly `category`), level, asset_id, name, country.
 *
 * Resolution order per ICAO:
 *   1. Public SimFly airport details endpoint — authoritative.
 *   2. Fresh Hub identity cache row — performance shortcut only.
 *   3. Last known stale cache row — only when SimFly is unavailable.
 *
 * Ownership is NEVER inferred from flight activity, pilots operating at the
 * airport, utilization tables or traffic history. This module reads and writes
 * identity fields only; it never touches analytics data.
 */

import type { AirportIdentityFull } from "./airport-identity.types";

export type { AirportIdentityFull };

const SIMFLY_DETAILS = "https://simfly.io/api/user/assets/details/airport";
/** Short in-process shortcut so a single render never re-fetches an ICAO. */
const FRESH_MS = 10 * 60_000;
/** Cache row lifetime before SimFly is consulted again. */
const CACHE_TTL_MS = 7 * 24 * 60 * 60_000;

const memo = new Map<string, { at: number; value: AirportIdentityFull }>();

export function normaliseAirportIcao(raw?: string | null): string {
  const v = (raw ?? "").trim().toUpperCase();
  return /^[A-Z0-9]{4}$/.test(v) ? v : "";
}

function emptyIdentity(icao: string): AirportIdentityFull {
  return {
    icao,
    name: null,
    owner: null,
    tier: null,
    level: null,
    assetId: null,
    country: null,
    source: "unknown",
    fetchedAt: null,
  };
}

type CacheRow = {
  icao: string;
  name: string | null;
  owner_username: string | null;
  tier: number | null;
  level: number | null;
  country: string | null;
  asset_id: string | null;
  fetched_at: string;
  refresh_after: string;
};

const CACHE_COLUMNS = "icao, name, owner_username, tier, level, country, asset_id, fetched_at, refresh_after";

function fromCacheRow(row: CacheRow, stale: boolean): AirportIdentityFull {
  return {
    icao: row.icao.toUpperCase(),
    name: row.name ?? null,
    owner: row.owner_username ?? null,
    tier: row.tier ?? null,
    level: row.level ?? null,
    assetId: row.asset_id ?? null,
    country: row.country ?? null,
    source: stale ? "stale-cache" : "cache",
    fetchedAt: row.fetched_at ?? null,
  };
}

/** A cache row is usable only when it is unexpired AND written by the current
 *  resolver shape (rows from the old radar-only resolver lack asset_id). */
function isCacheUsable(row: CacheRow): boolean {
  return new Date(row.refresh_after).getTime() > Date.now() && row.asset_id !== null;
}

async function readCache(icaos: string[]): Promise<Map<string, CacheRow>> {
  const out = new Map<string, CacheRow>();
  if (!icaos.length) return out;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("airport_identity_cache")
    .select(CACHE_COLUMNS)
    .in("icao", icaos);
  if (error) {
    console.warn("[airport-identity] cache read failed", error.message);
    return out;
  }
  for (const row of (data ?? []) as CacheRow[]) out.set(row.icao.toUpperCase(), row);
  return out;
}

async function writeCache(id: AirportIdentityFull) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const now = Date.now();
    await supabaseAdmin.from("airport_identity_cache").upsert(
      {
        icao: id.icao,
        name: id.name,
        owner_username: id.owner,
        tier: id.tier,
        level: id.level,
        country: id.country,
        asset_id: id.assetId,
        fetched_at: new Date(now).toISOString(),
        refresh_after: new Date(now + CACHE_TTL_MS).toISOString(),
      },
      { onConflict: "icao" },
    );
  } catch (err) {
    console.warn("[airport-identity] cache write failed", id.icao, err instanceof Error ? err.message : err);
  }
}

/** Fetch identity straight from the public SimFly airport details endpoint. */
async function fetchFromSimfly(icao: string): Promise<AirportIdentityFull | null> {
  try {
    const res = await fetch(`${SIMFLY_DETAILS}/${encodeURIComponent(icao)}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as Record<string, unknown>;
    const node = ((json as { data?: Record<string, unknown> }).data ?? json) as Record<string, unknown>;
    if (!node || typeof node !== "object") return null;
    const owner = node["owner"] as { username?: string } | undefined;
    const assetId = node["asset_id"];
    return {
      icao,
      name: typeof node["name"] === "string" ? (node["name"] as string) : null,
      owner: owner?.username ?? null,
      // SimFly calls the airport tier "category".
      tier: typeof node["category"] === "number" ? (node["category"] as number) : null,
      level: typeof node["level"] === "number" ? (node["level"] as number) : null,
      assetId: assetId === null || assetId === undefined ? null : String(assetId),
      country: typeof node["country"] === "string" ? (node["country"] as string) : null,
      source: "simfly",
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.warn("[airport-identity] SimFly fetch failed", icao, err instanceof Error ? err.message : err);
    return null;
  }
}

async function resolveOne(
  icao: string,
  cached: CacheRow | undefined,
  force: boolean,
): Promise<AirportIdentityFull> {
  const hit = memo.get(icao);
  if (!force && hit && Date.now() - hit.at < FRESH_MS) return hit.value;

  const cacheFresh = cached && isCacheUsable(cached);
  if (!force && cacheFresh) {
    const value = fromCacheRow(cached, false);
    memo.set(icao, { at: Date.now(), value });
    return value;
  }

  const live = await fetchFromSimfly(icao);
  if (live) {
    memo.set(icao, { at: Date.now(), value: live });
    await writeCache(live);
    return live;
  }

  // SimFly unavailable — fall back to whatever we last knew.
  if (cached) {
    const value = fromCacheRow(cached, true);
    memo.set(icao, { at: Date.now(), value });
    return value;
  }
  return emptyIdentity(icao);
}

/** Resolve one airport's identity. `force` bypasses every cache layer. */
export async function resolveAirportIdentityFull(
  icaoRaw: string,
  opts?: { force?: boolean },
): Promise<AirportIdentityFull> {
  const icao = normaliseAirportIcao(icaoRaw);
  if (!icao) return emptyIdentity((icaoRaw ?? "").trim().toUpperCase());
  const cache = await readCache([icao]);
  return resolveOne(icao, cache.get(icao), Boolean(opts?.force));
}

/** Batched resolver, concurrency-limited. Never throws for a single failure. */
export async function resolveAirportIdentities(
  icaosRaw: string[],
  opts?: { force?: boolean; concurrency?: number; maxLive?: number },
): Promise<Map<string, AirportIdentityFull>> {
  const out = new Map<string, AirportIdentityFull>();
  const targets = Array.from(
    new Set(icaosRaw.map(normaliseAirportIcao).filter((v): v is string => Boolean(v))),
  );
  if (!targets.length) return out;

  const cache = await readCache(targets);
  const force = Boolean(opts?.force);
  const concurrency = Math.max(1, Math.min(opts?.concurrency ?? 8, 12));

  // Guard against a cold cache turning one page render into hundreds of
  // SimFly calls: beyond the budget we serve cached values and let later
  // requests fill the rest in.
  const maxLive = opts?.maxLive ?? Number.POSITIVE_INFINITY;
  let live = 0;

  let idx = 0;
  async function worker() {
    while (idx < targets.length) {
      const icao = targets[idx++]!;
      const row = cache.get(icao);
      const rowFresh = row ? isCacheUsable(row) : false;
      if (!rowFresh && live >= maxLive) {
        out.set(icao, row ? fromCacheRow(row, true) : emptyIdentity(icao));
        continue;
      }
      if (!rowFresh) live += 1;
      try {
        out.set(icao, await resolveOne(icao, row, force));
      } catch {
        out.set(icao, cache.get(icao) ? fromCacheRow(cache.get(icao)!, true) : emptyIdentity(icao));
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, worker));
  return out;
}

// Server-only implementation of the Stage 1 identity layer.
// Filename ends in `.server.ts` so it is blocked from client bundles.
import { getRequestHeader } from "@tanstack/react-start/server";

const SIMFLY_BASE = "https://simfly.io/api";
const FETCH_TIMEOUT_MS = 12_000;
const NONCE_TTL_MS = 6 * 60 * 60_000; // 6h — matches alliance cache
const DEFAULT_USERNAME = "shill";
const DEFAULT_NONCE = "1697880083";

function envUsername() {
  return process.env.SIMFLY_USERNAME || DEFAULT_USERNAME;
}
function envNonce() {
  return process.env.SIMFLY_NONCE || DEFAULT_NONCE;
}

async function fetchJSON<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

type RawSkyRank = {
  content?: { ranks?: { username?: string; usernonce?: number }[] };
};
type RawLive = { data?: { username?: string; usernonce?: number }[] };
type RawAssets = { items?: { type?: string; icao?: string }[] };
type RawVisitor = {
  flights?: {
    pilot?: { username?: string; usernonce?: number };
    airplane?: { owner?: { username?: string; nonce?: number } };
    origin?: { owner?: { username?: string; nonce?: number } };
    destination?: { owner?: { username?: string; nonce?: number } };
  }[];
};

async function discoverNonce(username: string): Promise<number | null> {
  const key = username.toLowerCase();
  const remember = new Map<string, number>();
  const stash = (u?: string, n?: number) => {
    if (!u || typeof n !== "number" || !Number.isFinite(n)) return;
    const k = u.toLowerCase();
    if (!remember.has(k)) remember.set(k, n);
  };

  for (const period of ["all", "month", "week", "day"] as const) {
    const r = await fetchJSON<RawSkyRank>(
      `${SIMFLY_BASE}/game/sky-rank?period=${period}&res=16&uname=${encodeURIComponent(username)}`,
    );
    for (const e of r?.content?.ranks ?? []) stash(e.username, e.usernonce);
    const hit = remember.get(key);
    if (hit) return hit;
  }

  const live = await fetchJSON<RawLive>(`${SIMFLY_BASE}/flights`);
  for (const d of live?.data ?? []) stash(d.username, d.usernonce);
  let hit = remember.get(key);
  if (hit) return hit;

  const me = envUsername();
  const myNonce = envNonce();
  const assets = await fetchJSON<RawAssets>(
    `${SIMFLY_BASE}/user/assets/all?username=${encodeURIComponent(me)}&nonce=${encodeURIComponent(myNonce)}`,
  );
  const anchor = (assets?.items ?? []).find(
    (it) => it.type === "Airport" && typeof it.icao === "string",
  );
  if (anchor?.icao) {
    for (let page = 1; page <= 6 && !remember.has(key); page += 1) {
      const r = await fetchJSON<RawVisitor>(
        `${SIMFLY_BASE}/user/assets/airport/${encodeURIComponent(anchor.icao)}/flights?username=${encodeURIComponent(me)}&nonce=${encodeURIComponent(myNonce)}&page=${page}`,
      );
      if (!r?.flights?.length) break;
      for (const f of r.flights) {
        stash(f.pilot?.username, f.pilot?.usernonce);
        stash(f.airplane?.owner?.username, f.airplane?.owner?.nonce);
        stash(f.origin?.owner?.username, f.origin?.owner?.nonce);
        stash(f.destination?.owner?.username, f.destination?.owner?.nonce);
      }
    }
    hit = remember.get(key);
    if (hit) return hit;
  }

  return null;
}

export type SessionIdentity = {
  username: string;
  nonce: string;
  source: "session" | "cache" | "resolved" | "env-fallback";
};

export async function getSessionIdentity(override?: {
  username?: string;
}): Promise<SessionIdentity> {
  let requested: string | null = null;
  try {
    requested = getRequestHeader("x-simfly-user") ?? null;
  } catch {
    requested = null;
  }
  const username = (override?.username || requested || envUsername()).trim();
  const isOwner = username.toLowerCase() === envUsername().toLowerCase();
  if (isOwner) {
    return { username, nonce: envNonce(), source: "env-fallback" };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: row } = await supabaseAdmin
    .from("pilot_nonces")
    .select("nonce, resolved_at")
    .eq("username", username)
    .maybeSingle();

  if (row?.nonce && row.resolved_at) {
    const ageMs = Date.now() - new Date(row.resolved_at).getTime();
    if (ageMs < NONCE_TTL_MS) {
      console.log(
        `[Identity] Pilot: ${username} | cache HIT | nonce=${row.nonce} | ageMin=${Math.round(ageMs / 60000)}`,
      );
      return { username, nonce: String(row.nonce), source: "cache" };
    }
  }

  console.log(`[Identity] Pilot: ${username} | cache MISS → discovering nonce…`);
  const discovered = await discoverNonce(username);
  if (discovered == null) {
    console.log(
      `[Identity] Pilot: ${username} | discovery FAILED → using env nonce fallback`,
    );
    return { username, nonce: envNonce(), source: "env-fallback" };
  }

  const nonceStr = String(discovered);
  try {
    await supabaseAdmin
      .from("pilot_nonces")
      .upsert(
        { username, nonce: nonceStr, resolved_at: new Date().toISOString() },
        { onConflict: "username" },
      );
    // Record that this pilot has been seen by the Hub. Synchronisation itself
    // is session-driven (see `runSessionCatchUp`), not scheduled.
    const { recordPilotSeen } = await import("./simfly-sync.server");
    await recordPilotSeen(username);
  } catch (err) {
    console.log(
      `[Identity] Pilot: ${username} | upsert pilot_nonces failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  console.log(
    `[Identity] Pilot: ${username} | resolved nonce=${nonceStr} → upserted`,
  );
  return { username, nonce: nonceStr, source: "resolved" };
}

export function isOwnerUsername(username: string): boolean {
  return username.toLowerCase() === envUsername().toLowerCase();
}

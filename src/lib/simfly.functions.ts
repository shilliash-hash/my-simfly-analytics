import { createServerFn } from "@tanstack/react-start";
import { MOCK_PAYLOAD } from "./mock-data";
import type {
  ActivityEntry,
  Aircraft,
  AircraftExt,
  AirportExt,
  AirportFlightHistoryItem,
  AirportLiveVisitor,
  MyLiveFlight,
  AirportTier,
  EarningsPoint,
  FlightLog,
  Hub,
  LicenseExt,
  PaxByAsset,
  Player,
  SimflyPayload,
  Tier,
  VisitorAggregate,
  VisitorAirportBreakdown,
  VisitorContribution,
  VisitorHistoryPayload,
  XpByAsset,
} from "./types";
import { computeEta, uuidV7Ms } from "./aircraft-specs";

/**
 * SimFly.io public API wrapper. Every endpoint we hit is unauthenticated.
 *
 *  GET /api/user/v2/?nonce=&username=         profile (name, country, hub)
 *  GET /api/user/stats?nonce=&username=       lifetime rewards + flight stats
 *  GET /api/user/pax?nonce=&username=         available PAX wallet balance
 *  GET /api/user/assets/all?username=&nonce=  airports + airplanes + licences
 *  GET /api/user/flights?username=&nonce=&fpage=N  paginated logbook
 *  GET /api/user/badges?username=&nonce=      earned event badges
 *  GET /api/user/assets/details/airport/{ICAO}      airport detail
 *  GET /api/user/assets/details/airplane/{uuid}     airplane detail
 *  GET /api/asset/airport/{ICAO}/flights      LIVE flights touching airport
 */

const SIMFLY_BASE = "https://simfly.io/api";
const DEFAULT_USERNAME = "shill";
const DEFAULT_NONCE = "1697880083";
const FETCH_TIMEOUT_MS = 12_000;
const AIRCRAFT_BACKFILL_DAYS = 100;
const AIRCRAFT_BACKFILL_PAGE_LIMIT = 180;
const AIRCRAFT_BACKFILL_BATCH_SIZE = 8;

// ---- Per-isolate in-memory cache for heavy SimFly scans.
// Survives within a single Cloudflare Worker isolate so repeated dashboard
// loads / route remounts within the TTL skip the 25×hubs + aircraft sweep
// and the 20k-row DB read entirely. Self-evicts when the isolate recycles.
const HEAVY_CACHE_TTL_MS = 90_000;
const heavyCache = new Map<string, { at: number; value: unknown }>();
async function memo<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = heavyCache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await fn();
  heavyCache.set(key, { at: Date.now(), value });
  return value;
}

function defaultUsername() {
  return process.env.SIMFLY_USERNAME || DEFAULT_USERNAME;
}
function defaultNonce() {
  return process.env.SIMFLY_NONCE || DEFAULT_NONCE;
}

// SimFly requires a user-specific `nonce` query param for /api/user/* endpoints.
// The nonce is exposed publicly on live-flights and visitor-history entries,
// so we resolve it on demand and memoise.
const nonceCache = new Map<string, number>();

type RawLiveFlightsEnvelope = { data?: { username?: string; usernonce?: number }[] };
type RawVisitorPilotShape = {
  pilot?: { username?: string; usernonce?: number };
  airplane?: { owner?: { username?: string; nonce?: number } };
  origin?: { owner?: { username?: string; nonce?: number } };
  destination?: { owner?: { username?: string; nonce?: number } };
  licence?: { owner?: { username?: string; nonce?: number } };
};

function rememberNonce(username?: string, nonce?: number) {
  if (!username || typeof nonce !== "number" || !Number.isFinite(nonce)) return;
  const key = username.toLowerCase();
  if (!nonceCache.has(key)) nonceCache.set(key, nonce);
}

async function resolveNonce(username: string): Promise<number | null> {
  const key = username.toLowerCase();
  if (key === defaultUsername().toLowerCase()) return Number(defaultNonce()) || null;
  const cached = nonceCache.get(key);
  if (cached) return cached;

  // 0) Primary: SimFly Sky Ranking exposes every public pilot with their
  // numeric `usernonce` (the same id used in /logbook/<user>/<nonce> URLs).
  for (const period of ["all", "month", "week", "day"] as const) {
    const r = await fetchJSON<{
      content?: { ranks?: { username?: string; usernonce?: number }[] };
    }>(`${SIMFLY_BASE}/game/sky-rank?period=${period}&res=16&uname=${encodeURIComponent(username)}`);
    for (const e of r?.content?.ranks ?? []) rememberNonce(e.username, e.usernonce);
    const hit = nonceCache.get(key);
    if (hit) return hit;
  }

  // 1) Try live flights — fastest path if the pilot is airborne.
  const live = await fetchJSON<RawLiveFlightsEnvelope>(`${SIMFLY_BASE}/live/flights`);
  for (const d of live?.data ?? []) rememberNonce(d.username, d.usernonce);
  let hit = nonceCache.get(key);
  if (hit) return hit;

  // 2) Fallback: scan visitor history at one of the logged-in pilot's airports.
  // Other pilots' nonces show up in pilot.usernonce / owner.nonce on each entry.
  const me = defaultUsername();
  const myNonce = defaultNonce();
  const assets = await fetchJSON<RawAssetsAll>(
    `${SIMFLY_BASE}/user/assets/all?username=${encodeURIComponent(me)}&nonce=${encodeURIComponent(myNonce)}`,
  );
  const anchor = (assets?.items ?? []).find(
    (it): it is RawAssetAirport => it.type === "Airport",
  );
  if (anchor) {
    for (let page = 1; page <= 6 && !nonceCache.has(key); page += 1) {
      const r = await fetchJSON<{ flights?: RawVisitorPilotShape[] }>(
        `${SIMFLY_BASE}/user/assets/airport/${encodeURIComponent(anchor.icao)}/flights?username=${encodeURIComponent(me)}&nonce=${encodeURIComponent(myNonce)}&page=${page}`,
      );
      if (!r?.flights?.length) break;
      for (const f of r.flights) {
        rememberNonce(f.pilot?.username, f.pilot?.usernonce);
        for (const slot of [f.airplane, f.origin, f.destination, f.licence]) {
          rememberNonce(slot?.owner?.username, slot?.owner?.nonce);
        }
      }
    }
    hit = nonceCache.get(key);
    if (hit) return hit;
  }

  return null;
}

function sanitiseNonce(raw: string | undefined | null): string {
  if (!raw) return "";
  // SimFly nonces are numeric ids — reject anything else to prevent
  // query-string injection when interpolated into upstream URLs.
  return /^\d+$/.test(raw) ? raw : "";
}

async function resolveIdentity(input?: { username?: string; nonce?: string }) {
  const username = (input?.username || defaultUsername()).trim();
  const supplied = sanitiseNonce(input?.nonce);
  if (supplied) return { username, nonce: supplied };
  if (username.toLowerCase() === defaultUsername().toLowerCase()) {
    return { username, nonce: defaultNonce() };
  }
  const n = await resolveNonce(username);
  return { username, nonce: n ? String(n) : defaultNonce() };
}

// Sync fallback for legacy call sites that don't (yet) need per-user nonce.
function identity(input?: { username?: string; nonce?: string }) {
  const username = input?.username || defaultUsername();
  const cached = nonceCache.get(username.toLowerCase());
  const supplied = sanitiseNonce(input?.nonce);
  return {
    username,
    nonce: supplied || (cached ? String(cached) : defaultNonce()),
  };
}

async function fetchJSON<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchText(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJSONPages<T>(urls: string[], concurrency = 4): Promise<(T | null)[]> {
  const out: (T | null)[] = new Array(urls.length).fill(null);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, urls.length) }, async () => {
      while (next < urls.length) {
        const idx = next++;
        out[idx] = (await fetchJSON<T>(urls[idx])) ?? (await fetchJSON<T>(urls[idx]));
      }
    }),
  );
  return out;
}

function uuidV7TimestampMs(id?: string): number | null {
  const prefix = id?.replace(/-/g, "").slice(0, 12);
  if (!prefix || prefix.length !== 12) return null;
  const ms = Number.parseInt(prefix, 16);
  return Number.isFinite(ms) ? ms : null;
}

function histFlightTimeMs(raw: RawAirportHistFlight): number | null {
  const ts = raw.departureTime ?? raw.takeoffTime ?? raw.landingTime ?? "";
  const parsed = ts ? new Date(ts).getTime() : NaN;
  if (Number.isFinite(parsed)) return parsed;
  return uuidV7TimestampMs(raw.flightID);
}

// ----- Raw response shapes -----

type RawProfile = {
  username: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  registeredDate?: string;
  country?: string;
  hub?: string;
  views?: number;
  premiumMember?: boolean;
};

type RawStats = {
  rewards: { xp: number; pax: number; totalPAXReceived: number };
  stats: {
    totalFlights: number;
    totalFlightTime: string;
    totalDistance: number;
    tripsAroundTheWorld: number;
    averageFlightTime?: string;
    averageDistance?: number;
    visitedCountry?: { name: string; total: number }[];
  };
};



type RawAssetAirport = {
  type: "Airport";
  name: string;
  icao: string;
  sku: string;
  country?: string;
  level: number;
  level_progress: number;
  xp: number;
  earnedXp: number;
  pax: number;
  earnedPax: number;
  totalEarnedXp?: number;
  totalEarnedPax?: number;
  category: number;
  slug: string;
  asset_id: number;
  image_src?: string;
  rotation?: number;
  maxRotation?: number;
  totalRotations?: number;
  percToUser?: number;
  active?: boolean;
  canUpgrade?: boolean;
};

type RawAssetAirplane = {
  type: "Airplane";
  name: string;
  icao: string;
  sku: string;
  aircraftId: string;
  tailNumber?: string;
  level: number;
  level_progress: number;
  xp: number;
  earnedXp: number;
  pax: number;
  earnedPax: number;
  totalEarnedXp?: number;
  totalEarnedPax?: number;
  category: number;
  slug: string;
  asset_id: number;
  image_src?: string;
  image_badge_src?: string;
  range?: number;
  airportICAO?: string;
  active?: boolean;
  canRent?: boolean;
  attributes?: Record<string, unknown>;
  timers?: { inGroundOperation?: boolean; inGroundOperationUntil?: string | null };
};

type RawLicenceTimer = {
  kind: "TIMER24" | "TIMER84" | string;
  minutesAvailable?: number;
  minutesReinstated?: number;
  nextRestoreTimestamp?: number;
  minsUntilNextRestore?: number;
};

type RawAssetLicence = {
  type: "Pilot License";
  name: string;
  sku: string;
  level: number;
  level_progress?: number;
  rank?: number;
  rank_name?: string;
  xp: number;
  earnedXp: number;
  pax: number;
  earnedPax: number;
  totalEarnedXp?: number;
  totalEarnedPax?: number;
  slug: string;
  asset_id: number;
  code?: string;
  image_src?: string;
  image_badge_src?: string;
  timers?: RawLicenceTimer[];
};

type RawAsset = RawAssetAirport | RawAssetAirplane | RawAssetLicence;
type RawAssetsAll = { page: number; totalPages: number; items: RawAsset[] };

type RawFlightLite = {
  id: string;
  aircraft: string;
  aircraft_icao: string;
  aircraftId: string;
  aircraft_tailNumber?: string;
  departure_icao: string;
  destination_icao: string;
  mission_start_ts: string;
  landing_rate?: number;
  total_distance: number;
  flight_time: string;
  total_reward: number;
  pax: number;
  xp: number;
  licence?: string;
  licence_rank?: number;
  licence_rankName?: string;
  origin?: { name: string; icao: string };
  destination?: { name: string; icao: string };
};

type RawFlightsPage = {
  page: number;
  totalPages: number;
  totalFlights: number;
  items: number;
  flights: RawFlightLite[];
};

type RawLiveFlight = {
  id: string;
  username: string;
  usernonce: number;
  userAvatar?: string;
  aircraftName: string;
  aircraftICAO: string;
  originICAO: string;
  destinationICAO: string;
  tailNumber?: string;
  flightNumber?: string;
  simKind?: string;
  licence?: string;
  /** ISO timestamp when the mission started — authoritative for ETA. */
  startTime?: string;
};

// ----- Public types for the UI -----

export type SimflyAirportAsset = AirportExt;
export type SimflyAirplaneAsset = AircraftExt;
export type SimflyLicenceAsset = LicenseExt;

export type SimflyAssetsBundle = {
  airports: AirportExt[];
  airplanes: AircraftExt[];
  licences: LicenseExt[];
  username: string;
  nonce: string;
  fetchedAt: string;
  source: "live" | "error";
};

// ----- Tier helpers -----

const TIER_BY_CATEGORY: Record<number, { tier: AirportTier; label: string }> = {
  6: { tier: "T6", label: "Mega Hub" },
  5: { tier: "T5", label: "Major" },
  4: { tier: "T4", label: "Large" },
  3: { tier: "T3", label: "Medium" },
  2: { tier: "T2", label: "Regional" },
  1: { tier: "T1", label: "Airstrip" },
};

function tierFor(category: number): { tier: AirportTier; label: string } {
  return TIER_BY_CATEGORY[category] ?? { tier: "T1", label: `C${category}` };
}

const legacyTierForLevel = (level: number): Tier =>
  level >= 10 ? "platinum" : level >= 5 ? "gold" : level >= 3 ? "silver" : "bronze";

// ----- Mappers -----

function mapAirport(a: RawAssetAirport, flights: RawFlightLite[]): AirportExt {
  const now = Date.now();
  const wkAgo = now - 7 * 86_400_000;
  const moAgo = now - 30 * 86_400_000;
  // Owner only earns their share of each flight's PAX through this airport.
  // `percToUser` is the configured airport-owner cut (0–100). Fall back to a
  // conservative default if the API omits it so we never over-report.
  const shareRaw = a.percToUser ?? 0;
  const share = shareRaw > 1 ? shareRaw / 100 : shareRaw; // tolerate 0–1 or 0–100
  let pax7d = 0;
  let pax30d = 0;
  let flights7d = 0;
  for (const f of flights) {
    if (f.departure_icao !== a.icao && f.destination_icao !== a.icao) continue;
    const ts = new Date(f.mission_start_ts).getTime();
    if (!Number.isFinite(ts)) continue;
    const ownerPax = (f.pax || 0) * share;
    if (ts >= moAgo) pax30d += ownerPax;
    if (ts >= wkAgo) {
      pax7d += ownerPax;
      flights7d += 1;
    }
  }
  const { tier, label } = tierFor(a.category);
  return {
    icao: a.icao,
    name: a.name,
    country: a.country ?? "",
    slug: a.slug,
    category: a.category,
    tier,
    tierLabel: label,
    level: a.level,
    levelProgress: a.level_progress,
    totalEarnedPax: a.totalEarnedPax ?? a.earnedPax ?? a.pax,
    totalEarnedXp: a.totalEarnedXp ?? a.earnedXp,
    rotation: a.rotation ?? 0,
    maxRotation: a.maxRotation ?? 0,
    totalRotations: a.totalRotations ?? 0,
    percToUser: a.percToUser ?? 0,
    imageSrc: a.image_src,
    pax7d,
    pax30d,
    flights7d,
  };
}


function mapAirplane(a: RawAssetAirplane, flights: RawFlightLite[]): AircraftExt {
  const now = Date.now();
  const wkAgo = now - 7 * 86_400_000;
  const moAgo = now - 30 * 86_400_000;
  let pax7d = 0;
  let pax30d = 0;
  for (const f of flights) {
    if (f.aircraftId !== a.aircraftId) continue;
    const ts = new Date(f.mission_start_ts).getTime();
    if (Number.isFinite(ts)) {
      if (ts >= moAgo) pax30d += f.pax || 0;
      if (ts >= wkAgo) pax7d += f.pax || 0;
    }
  }
  return {
    aircraftId: a.aircraftId,
    name: a.name,
    icao: a.icao,
    tailNumber: a.tailNumber ?? "",
    slug: a.slug,
    level: a.level,
    levelProgress: a.level_progress,
    totalEarnedPax: a.totalEarnedPax ?? a.earnedPax ?? a.pax,
    totalEarnedXp: a.totalEarnedXp ?? a.earnedXp,
    currentIcao: a.airportICAO ?? "",
    category: a.category,
    imageSrc: a.image_src,
    inGroundOperation: !!a.timers?.inGroundOperation,
    groundedUntil: a.timers?.inGroundOperationUntil ?? null,
    pax7d,
    pax30d,
  };
}

function mapLicence(a: RawAssetLicence, flights: RawFlightLite[]): LicenseExt {
  const now = Date.now();
  const wkAgo = now - 7 * 86_400_000;
  const moAgo = now - 30 * 86_400_000;
  let pax7d = 0;
  let pax30d = 0;
  for (const f of flights) {
    if (!a.code || f.licence !== a.code) continue;
    const ts = new Date(f.mission_start_ts).getTime();
    if (Number.isFinite(ts)) {
      if (ts >= moAgo) pax30d += f.pax || 0;
      if (ts >= wkAgo) pax7d += f.pax || 0;
    }
  }
  return {
    sku: a.sku,
    slug: a.slug,
    code: a.code ?? "",
    name: a.name,
    rank: a.rank ?? 0,
    rankName: a.rank_name ?? "",
    level: a.level,
    levelProgress: a.level_progress ?? 0,
    totalEarnedPax: a.totalEarnedPax ?? a.earnedPax ?? a.pax,
    totalEarnedXp: a.totalEarnedXp ?? a.earnedXp,
    imageSrc: a.image_badge_src ?? a.image_src,
    pax7d,
    pax30d,
    timers: (a.timers ?? [])
      .filter((t) => t.kind === "TIMER24" || t.kind === "TIMER84")
      .map((t) => ({
        kind: t.kind as "TIMER24" | "TIMER84",
        minutesAvailable: t.minutesAvailable ?? 0,
        minutesCap: t.minutesReinstated ?? 0,
        nextRestoreTs: t.nextRestoreTimestamp ?? 0,
        minsUntilNextRestore: t.minsUntilNextRestore ?? 0,
      })),
  };
}

function airportToHub(a: AirportExt, owner: string): Hub {
  return {
    id: a.icao,
    icao: a.icao,
    name: a.name,
    city: a.country,
    country: a.country,
    ownerHandle: owner,
    level: a.level,
    tier: legacyTierForLevel(a.level),
    xp: a.totalEarnedXp,
    dailyPax: Math.round(a.pax7d / 7),
    dailyEarnings: Math.round(a.totalEarnedPax),
    passengerFlow: Math.round(a.pax30d),
    upgrades: Math.max(0, a.level - 1),
    lastUpgradeAt: new Date().toISOString(),
    lat: 0,
    lon: 0,
  };
}

function airplaneToAircraft(p: AircraftExt, owner: string): Aircraft {
  return {
    id: p.aircraftId,
    registration: p.tailNumber || p.icao,
    type: p.name,
    status: p.inGroundOperation ? "maintenance" : "active",
    locationIcao: p.currentIcao,
    ownerHandle: owner,
    xpGenerated: p.totalEarnedXp,
    flightsToday: 0,
    paxToday: Math.round(p.totalEarnedPax),
  };
}

type FlightSplit = { kept: number; donated: number };

type RawMissionSlot = {
  pax?: number;
  earnedPax?: number;
  totalEarnedPax?: number;
  sharedPax?: number | null;
  percToUser?: number | null;
  owner?: { username?: string };
};

type RawMissionLog = {
  flightID: string;
  pax?: number;
  airplane?: RawMissionSlot;
  origin?: RawMissionSlot;
  destination?: RawMissionSlot;
  licence?: RawMissionSlot;
};

function splitFromMissionLog(d: RawMissionLog, me: string): FlightSplit {
  const kept = d.pax || 0;
  let donated = 0;
  const slots: (RawMissionSlot | undefined)[] = [d.airplane, d.origin, d.destination, d.licence];
  for (const s of slots) {
    const owner = s?.owner?.username;
    if (!s || !owner || owner === me) continue;
    if (typeof s.sharedPax === "number" && Number.isFinite(s.sharedPax)) {
      donated += Math.abs(s.sharedPax);
    } else {
      const gross = s.pax ?? 0;
      const userGot = s.totalEarnedPax ?? s.earnedPax ?? 0;
      donated += Math.max(0, gross - userGot);
    }
  }
  return { kept, donated };
}

async function fetchMissionSplit(id: string, me: string): Promise<FlightSplit | null> {
  const d = await fetchJSON<RawMissionLog>(`${SIMFLY_BASE}/user/missions/log/${id}`);
  if (!d) return null;
  return splitFromMissionLog(d, me);
}

async function fetchSplitsForFlights(
  flights: RawFlightLite[],
  me: string,
  concurrency = 8,
): Promise<Map<string, FlightSplit>> {
  const out = new Map<string, FlightSplit>();
  let i = 0;
  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (i < flights.length) {
        const idx = i++;
        const f = flights[idx];
        const split = await fetchMissionSplit(f.id, me);
        if (split) out.set(f.id, split);
      }
    }),
  );
  return out;
}

function flightsToTimeseries(flights: RawFlightLite[]): EarningsPoint[] {
  // For pilot-piloted flights, top-level `pax` is the net PAX paid to the
  // pilot after every split. Visitor PAX is folded in later.
  const map = new Map<string, EarningsPoint>();
  let earliest: number | null = null;
  for (const f of flights) {
    const day = (f.mission_start_ts || "").slice(0, 10);
    if (!day) continue;
    const cur = map.get(day) ?? { date: day, pax: 0, paxKept: 0, paxDonated: 0, xp: 0 };
    const kept = f.pax || 0;
    cur.pax += kept;
    cur.paxKept = (cur.paxKept ?? 0) + kept;
    cur.xp += f.xp || 0;
    map.set(day, cur);
    const ts = new Date(day + "T00:00:00Z").getTime();
    if (Number.isFinite(ts) && (earliest === null || ts < earliest)) earliest = ts;
  }
  const today = new Date();
  // Always emit at least the trailing 30 days; extend back to the earliest
  // recorded flight so the UI can paginate through full history.
  const todayMs = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const minStart = todayMs - 29 * 86_400_000;
  const startMs = earliest !== null ? Math.min(earliest, minStart) : minStart;
  const out: EarningsPoint[] = [];
  for (let t = startMs; t <= todayMs; t += 86_400_000) {
    const key = new Date(t).toISOString().slice(0, 10);
    const pt = map.get(key) ?? { date: key, pax: 0, paxKept: 0, paxDonated: 0, xp: 0 };
    pt.paxKept = Math.round((pt.paxKept ?? 0) * 100) / 100;
    pt.paxDonated = 0;
    pt.pax = Math.round(pt.pax * 100) / 100;
    out.push(pt);
  }
  return out;
}

function flightsToLog(flights: RawFlightLite[]): FlightLog[] {
  return flights.map((f) => ({
    id: f.id,
    ts: f.mission_start_ts,
    aircraftName: f.aircraft,
    aircraftId: f.aircraftId,
    tailNumber: f.aircraft_tailNumber,
    departure: f.departure_icao,
    destination: f.destination_icao,
    distance: f.total_distance,
    flightTime: f.flight_time,
    pax: f.pax || 0,
    xp: f.xp || 0,
    totalReward: f.total_reward || 0,
    licenceCode: f.licence ?? "",
    licenceRank: f.licence_rank ?? 0,
  }));
}

type AircraftVisitorHistoryItem = AirportFlightHistoryItem & {
  airportIcao: string;
  _origin?: string;
  _destination?: string;
};

function normaliseAircraftVisitorFlight(
  raw: RawAirportHistFlight,
  plane: AircraftExt,
  me: string,
): AircraftVisitorHistoryItem | null {
  if (!raw.flightID) return null;
  const pilot = raw.pilot?.username ?? "";
  if (!pilot || pilot.toLowerCase() === me.toLowerCase()) return null;

  const planeOwner = raw.airplane?.owner?.username ?? "";
  const isOwnedPlane = planeOwner.toLowerCase() === me.toLowerCase() || raw.airplane?.aircraftId === plane.aircraftId;
  if (!isOwnedPlane) return null;

  const origin = raw.origin?.icao ?? "";
  const destination = raw.destination?.icao ?? "";
  return {
    id: raw.flightID,
    ts: raw.departureTime ?? raw.takeoffTime ?? raw.landingTime ?? new Date(uuidV7TimestampMs(raw.flightID) ?? Date.now()).toISOString(),
    visitor: pilot,
    isOwner: false,
    role: "takeoff",
    otherIcao: destination,
    paxVisitor: raw.pax ?? 0,
    paxAirport: 0,
    paxAircraft: raw.airplane?.totalEarnedPax ?? raw.airplane?.earnedPax ?? 0,
    aircraft: raw.airplane?.name ?? plane.name,
    airportIcao: origin || destination,
    _origin: origin,
    _destination: destination,
  };
}

export type AircraftBackfillPlaneSummary = {
  aircraftId: string;
  name: string;
  pagesScanned: number;
  pagesFailed: number;
  flightsFound: number;
  stoppedReason: "cutoff" | "empty" | "page-limit" | "error" | "skipped";
  error?: string;
};

async function fetchAircraftOwnedVisitorBackfill(
  airplanes: AircraftExt[],
  username: string,
): Promise<{ items: AircraftVisitorHistoryItem[]; summary: AircraftBackfillPlaneSummary[] }> {
  const cutoffMs = Date.now() - AIRCRAFT_BACKFILL_DAYS * 86_400_000;
  const all: AircraftVisitorHistoryItem[] = [];
  const summary: AircraftBackfillPlaneSummary[] = [];

  const scanPlane = async (plane: AircraftExt): Promise<AircraftVisitorHistoryItem[]> => {
    const s: AircraftBackfillPlaneSummary = {
      aircraftId: plane.aircraftId ?? "",
      name: plane.name ?? plane.aircraftId ?? "unknown",
      pagesScanned: 0,
      pagesFailed: 0,
      flightsFound: 0,
      stoppedReason: "page-limit",
    };
    if (!plane.aircraftId) {
      summary.push({ ...s, stoppedReason: "skipped", error: "missing aircraftId" });
      return [];
    }
    const out: AircraftVisitorHistoryItem[] = [];

    try {
      for (let page = 1; page <= AIRCRAFT_BACKFILL_PAGE_LIMIT; page += AIRCRAFT_BACKFILL_BATCH_SIZE) {
        const pageNumbers = Array.from(
          { length: Math.min(AIRCRAFT_BACKFILL_BATCH_SIZE, AIRCRAFT_BACKFILL_PAGE_LIMIT - page + 1) },
          (_, i) => page + i,
        );

        let pages: (RawAirportHistPage | null)[] = [];
        try {
          pages = await fetchJSONPages<RawAirportHistPage>(
            pageNumbers.map((n) => `${SIMFLY_BASE}/user/assets/airplane/${encodeURIComponent(plane.aircraftId)}/flights?page=${n}`),
            3,
          );
        } catch (err) {
          s.pagesFailed += pageNumbers.length;
          s.stoppedReason = "error";
          s.error = err instanceof Error ? err.message : String(err);
          break;
        }

        s.pagesScanned += pages.length;
        s.pagesFailed += pages.filter((p) => p === null).length;

        let sawAnyFlight = false;
        let sawInBackfillWindow = false;
        for (const r of pages) {
          if (!r?.flights?.length) continue;
          sawAnyFlight = true;
          for (const raw of r.flights) {
            const ms = histFlightTimeMs(raw);
            if (ms === null || ms >= cutoffMs) sawInBackfillWindow = true;
            if (ms !== null && ms < cutoffMs) continue;
            try {
              const item = normaliseAircraftVisitorFlight(raw, plane, username);
              if (item) out.push(item);
            } catch {
              // skip malformed flight, keep partial results
            }
          }
        }

        if (!sawAnyFlight) { s.stoppedReason = "empty"; break; }
        if (!sawInBackfillWindow) { s.stoppedReason = "cutoff"; break; }
      }
    } catch (err) {
      s.stoppedReason = "error";
      s.error = err instanceof Error ? err.message : String(err);
    }

    s.flightsFound = out.length;
    summary.push(s);
    return out;
  };

  for (let i = 0; i < airplanes.length; i += 2) {
    const batch = airplanes.slice(i, i + 2);
    const results = await Promise.allSettled(batch.map(scanPlane));
    results.forEach((r, j) => {
      if (r.status === "fulfilled") {
        all.push(...r.value);
      } else {
        const plane = batch[j];
        summary.push({
          aircraftId: plane.aircraftId ?? "",
          name: plane.name ?? plane.aircraftId ?? "unknown",
          pagesScanned: 0,
          pagesFailed: 0,
          flightsFound: 0,
          stoppedReason: "error",
          error: r.reason instanceof Error ? r.reason.message : String(r.reason),
        });
      }
    });
  }

  const failed = summary.filter((s) => s.stoppedReason === "error").length;
  console.info(
    `[aircraft-backfill] planes=${airplanes.length} ok=${summary.length - failed} failed=${failed} flights=${all.length}`,
  );
  if (failed > 0) {
    for (const s of summary.filter((x) => x.stoppedReason === "error")) {
      console.warn(`[aircraft-backfill] ${s.name} (${s.aircraftId}) failed: ${s.error}`);
    }
  }

  return { items: all, summary };
}

// ----- Server functions -----

export const getSimflyPayload = createServerFn({ method: "GET" })
  .inputValidator((d?: { username?: string; nonce?: string }) => d ?? {})
  .handler(async ({ data }): Promise<SimflyPayload> => {
    const { username, nonce } = await resolveIdentity(data);
    const qs = `username=${encodeURIComponent(username)}&nonce=${encodeURIComponent(nonce)}`;

    const [profile, stats, assets, availablePaxRaw, p1] = await Promise.all([
      fetchJSON<RawProfile>(`${SIMFLY_BASE}/user/v2/?nonce=${encodeURIComponent(nonce)}&username=${encodeURIComponent(username)}`),
      fetchJSON<RawStats>(`${SIMFLY_BASE}/user/stats?${qs}`),
      fetchJSON<RawAssetsAll>(`${SIMFLY_BASE}/user/assets/all?${qs}`),
      fetchText(`${SIMFLY_BASE}/user/pax?${qs}`),
      fetchJSON<RawFlightsPage>(`${SIMFLY_BASE}/user/flights?${qs}&fpage=1`),
    ]);

    if (!profile) {
      return { ...MOCK_PAYLOAD, _source: "mock", _stale: true };
    }

    // Historical flights come from the persisted backfill cache so the page
    // returns instantly and graphs include the full history even mid-import.
    // Page 1 of the live logbook is always merged on top so brand-new flights
    // appear immediately, and is upserted into the cache for the next visit.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { flightToRow, rowToRawFlight, sanitiseFlightRowForDb } = await import("./backfill.functions");

    const cachedRows = await memo(
      `db-flights:${username}`,
      HEAVY_CACHE_TTL_MS,
      async () => {
        const { data } = await supabaseAdmin
          .from("simfly_flights")
          .select("*")
          .eq("username", username)
          .order("mission_start_ts", { ascending: false })
          .limit(20000);
        return data ?? [];
      },
    );

    const cachedFlights: RawFlightLite[] = ((cachedRows ?? []) as Record<string, unknown>[]).map(
      rowToRawFlight,
    );

    // Upsert page-1 freshness into the cache. Fire-and-forget — never block
    // the dashboard response on a Postgres round-trip.
    if (p1?.flights?.length) {
      const total = p1.flights.length;
      const fresh = p1.flights.map((f, index) =>
        sanitiseFlightRowForDb(flightToRow(username, f, { page: 1, index, total }), username),
      );
      void supabaseAdmin
        .from("simfly_flights")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .upsert(fresh as any, { onConflict: "username,flight_id", ignoreDuplicates: true })
        .then(({ error }) => {
          if (error) console.warn("[simfly] page-1 upsert failed", error);
        });
    }

    const flights: RawFlightLite[] = Array.from(
      new Map(
        [...cachedFlights, ...(p1?.flights ?? [])].map((flight) => [flight.id, flight]),
      ).values(),
    );

    // For airport pax7d/pax30d we want flights from *any* pilot that touched
    // the viewed user's owned airports — visitors count as airport income.
    // Pull a 30d slice of cached flights touching those ICAOs across all
    // usernames, so pax7d/30d render for other pilots even without their own
    // backfill.
    const ownedIcaos = (assets?.items ?? [])
      .filter((it) => it.type === "Airport")
      .map((it) => (it as RawAssetAirport).icao);
    let airportFlights: RawFlightLite[] = flights;
    if (ownedIcaos.length > 0) {
      const sinceIso = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const visitorRows = await memo(
        `db-airport-visitors:${ownedIcaos.slice().sort().join(",")}`,
        HEAVY_CACHE_TTL_MS,
        async () => {
          const { data } = await supabaseAdmin
            .from("simfly_flights")
            .select("*")
            .or(
              `departure_icao.in.(${ownedIcaos.join(",")}),destination_icao.in.(${ownedIcaos.join(",")})`,
            )
            .gte("mission_start_ts", sinceIso)
            .limit(5000);
          return data ?? [];
        },
      );
      const visitorFlights = ((visitorRows ?? []) as Record<string, unknown>[]).map(
        rowToRawFlight,
      );
      airportFlights = Array.from(
        new Map(
          [...flights, ...visitorFlights].map((flight) => [flight.id, flight]),
        ).values(),
      );
    }

    const airports: AirportExt[] = [];
    const airplanes: AircraftExt[] = [];
    const licenses: LicenseExt[] = [];
    for (const it of assets?.items ?? []) {
      if (it.type === "Airport") airports.push(mapAirport(it, airportFlights));
      else if (it.type === "Airplane") airplanes.push(mapAirplane(it, flights));
      else if (it.type === "Pilot License") licenses.push(mapLicence(it, flights));
    }

    const pilotLevel = Math.max(0, ...licenses.map((l) => l.level));
    const availablePax = availablePaxRaw ? Number(availablePaxRaw) || 0 : 0;
    const lifetimePax = Math.round(stats?.rewards.totalPAXReceived ?? stats?.rewards.pax ?? 0);

    const now = Date.now();
    const wk = now - 7 * 86_400_000;
    const mo = now - 30 * 86_400_000;
    let paxLast7d = 0;
    let paxLast30d = 0;
    for (const f of flights) {
      const ts = new Date(f.mission_start_ts).getTime();
      if (!Number.isFinite(ts)) continue;
      if (ts >= mo) paxLast30d += f.pax || 0;
      if (ts >= wk) paxLast7d += f.pax || 0;
    }

    const avatarUrl = profile.avatar
      ? `https://simfly.io/${profile.avatar.replace(/^(\.\.\/)+/, "")}`
      : undefined;

    const me: Player = {
      handle: profile.username,
      displayName: profile.username,

      level: pilotLevel || 1,
      xp: Math.round(stats?.rewards.xp ?? 0),
      paxTokens: Math.round(availablePax),
      avatarHue: 190,
      avatarUrl,
      joinedAt: profile.registeredDate
        ? new Date(profile.registeredDate.replace(" ", "T") + "Z").toISOString()
        : new Date().toISOString(),
      country: profile.country ?? "",
    };

    const hubs: Hub[] = airports.map((a) => airportToHub(a, me.handle));
    const aircraft: Aircraft[] = airplanes.map((p) => airplaneToAircraft(p, me.handle));

    const earningsTimeseries = flightsToTimeseries(flights);

    // Visitor history: other pilots flying through my assets. The airport leg
    // (origin.earnedPax / destination.earnedPax) and aircraft rental leg are
    // real PAX paid to me even when I am not the pilot.
    const VISITOR_PAGES = 25;

    const [visitorPerAirport, aircraftPerPlane] = await Promise.all([
      memo(`visitors-by-hub:${username}`, HEAVY_CACHE_TTL_MS, () =>
        Promise.all(
          airports.map(async (ap) => {
            const urls = Array.from({ length: VISITOR_PAGES }, (_, i) =>
              `${SIMFLY_BASE}/user/assets/airport/${encodeURIComponent(ap.icao)}/flights?username=${encodeURIComponent(username)}&nonce=${encodeURIComponent(nonce)}&page=${i + 1}`,
            );
            const pages = await fetchJSONPages<RawAirportHistPage>(urls, 3);
            const items: (AirportFlightHistoryItem & { airportIcao: string })[] = [];
            for (const r of pages) {
              if (!r) continue;
              for (const f of r.flights ?? []) {
                const n = normaliseHistFlight(f, ap.icao, username);
                if (n && !n.isOwner) items.push({ ...n, airportIcao: ap.icao });
              }
            }
            return items;
          }),
        ),
      ),
      // 3+ month aircraft backfill: any external flight on one of my airplanes
      // must be recovered even when neither airport is mine.
      memo(`aircraft-backfill:${username}`, HEAVY_CACHE_TTL_MS, () =>
        fetchAircraftOwnedVisitorBackfill(airplanes, username),
      ),
    ]);

    const visitorFlights = [...visitorPerAirport.flat(), ...aircraftPerPlane.items];
    // De-dupe across hubs + aircraft feeds (a flight can appear in multiple sources).
    type VisitorFlightRec = AirportFlightHistoryItem & {
      airportIcao: string;
      _origin?: string;
      _destination?: string;
    };
    const byVisitorFlight = new Map<string, VisitorFlightRec>();
    for (const v of visitorFlights as VisitorFlightRec[]) {
      const prev = byVisitorFlight.get(v.id);
      if (!prev) {
        byVisitorFlight.set(v.id, v);
      } else {
        byVisitorFlight.set(v.id, {
          ...prev,
          paxAirport: prev.paxAirport + v.paxAirport,
          // paxAircraft is per-flight, not per-hub — take max so we don't double-count.
          paxAircraft: Math.max(prev.paxAircraft ?? 0, v.paxAircraft ?? 0),
          _origin: prev._origin ?? v._origin,
          _destination: prev._destination ?? v._destination,
        });
      }
    }
    const uniqueVisitorFlights = Array.from(byVisitorFlight.values());

    // Fold visitor PAX (airport leg + aircraft rental) into daily timeseries.
    const visitorByDay = new Map<string, number>();
    for (const v of uniqueVisitorFlights) {
      const day = (v.ts || "").slice(0, 10);
      if (!day) continue;
      const total = (v.paxAirport || 0) + (v.paxAircraft || 0);
      visitorByDay.set(day, (visitorByDay.get(day) ?? 0) + total);
    }
    const existingDays = new Set(earningsTimeseries.map((pt) => pt.date));
    for (const [date] of visitorByDay) {
      if (!existingDays.has(date)) {
        earningsTimeseries.push({ date, pax: 0, paxKept: 0, paxDonated: 0, paxVisitors: 0, xp: 0 });
      }
    }
    earningsTimeseries.sort((a, b) => a.date.localeCompare(b.date));
    for (const pt of earningsTimeseries) {
      pt.paxVisitors = Math.round((visitorByDay.get(pt.date) ?? 0) * 100) / 100;
    }

    const xpByAsset: XpByAsset[] = [
      ...airports.slice(0, 6).map((a) => ({ label: a.icao, xp: a.totalEarnedXp, kind: "hub" as const })),
      ...airplanes.slice(0, 6).map((p) => ({ label: p.tailNumber || p.icao, xp: p.totalEarnedXp, kind: "aircraft" as const })),
    ].sort((a, b) => b.xp - a.xp);

    const paxByAsset: PaxByAsset[] = [
      ...airports.map((a) => ({ label: a.icao, pax: Math.round(a.totalEarnedPax), kind: "hub" as const })),
      ...airplanes.map((p) => ({ label: p.tailNumber || p.icao, pax: Math.round(p.totalEarnedPax), kind: "aircraft" as const })),
      ...licenses.map((l) => ({ label: l.code || l.name, pax: Math.round(l.totalEarnedPax), kind: "licence" as const })),
    ]
      .filter((r) => r.pax > 0)
      .sort((a, b) => b.pax - a.pax)
      .slice(0, 16);

    const flightLog = flightsToLog(flights);

    // Flight activity. If the flight consumed one of the user's licenses,
    // append the licence code inline — license PAX is already included in
    // f.pax (the flight report bundles license income), so we must NOT
    // emit a separate license entry with its own delta or it would
    // double-count the same PAX in the activity feed.
    const flightActivity: ActivityEntry[] = flights.map((f) => ({
      id: f.id,
      kind: f.licence ? ("license" as const) : ("route" as const),
      actorHandle: me.handle,
      message: `${f.departure_icao} → ${f.destination_icao} · ${f.aircraft}${f.licence ? ` · license ${f.licence}` : ""} · ${Math.round(f.total_distance)} nm`,
      delta: f.pax,
      at: f.mission_start_ts,
    }));

    // Visitor flights as activity, marked clearly.
    const visitorActivity: ActivityEntry[] = uniqueVisitorFlights.map((v) => {
      const orig = v._origin || (v.role === "takeoff" ? v.airportIcao : v.otherIcao);
      const dest = v._destination || (v.role === "takeoff" ? v.otherIcao : v.airportIcao);
      const tags: string[] = [];
      if (v.paxAircraft) tags.push("my aircraft");
      if (v.paxAirport) tags.push("my airport");
      return {
        id: `visitor-${v.id}`,
        kind: "route" as const,
        actorHandle: v.visitor,
        hubIcao: v.airportIcao,
        message: `(Visitor) @${v.visitor} · ${orig} → ${dest} · ${v.aircraft}${tags.length ? ` · ${tags.join(" + ")}` : ""}`,
        delta: Math.round(((v.paxAirport || 0) + (v.paxAircraft || 0)) * 100) / 100,
        at: v.ts,
      };
    });


    // Visitors: from logbook only my flights are visible, so this is empty for v1.
    const visitors: VisitorAggregate[] = [];

    return {
      me,
      paxTokens: Math.round(availablePax),
      level: me.level,
      xp: me.xp,
      availablePax,
      lifetimePax,
      paxLast7d: Math.round(paxLast7d),
      paxLast30d: Math.round(paxLast30d),
      aircraft,
      hubs,
      activity: [...flightActivity, ...visitorActivity]
        .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()),

      earningsTimeseries,
      xpByAsset,
      paxByAsset,
      airports,
      airplanes,
      licenses,
      flights: flightLog,
      visitors,
      community: MOCK_PAYLOAD.community,
      _source: "live",
      _fetchedAt: new Date().toISOString(),
    };
  });

// ---------------------------------------------------------------------------
// Revenue attribution consistency check
//
// Re-scans owned-airport and owned-aircraft flight histories and compares,
// per flight, the PAX we credit to you (paxAirport + paxAircraft) against
// the PAX SimFly actually paid out for the slots you own (origin/destination
// earnedPax when you own the airport + airplane.earnedPax when you own the
// plane). Any row where attributed != expected is a discrepancy.
// ---------------------------------------------------------------------------

export type RevenueConsistencyRow = {
  flightID: string;
  ts: string;
  pilot: string;
  origin: string;
  destination: string;
  aircraft: string;
  ownsOrigin: boolean;
  ownsDestination: boolean;
  ownsAircraft: boolean;
  expectedAirport: number;
  expectedAircraft: number;
  attributedAirport: number;
  attributedAircraft: number;
  expectedTotal: number;
  attributedTotal: number;
  diff: number;
  sources: ("airport" | "aircraft")[];
};

export type RevenueConsistencyReport = {
  username: string;
  checkedAt: string;
  scannedAirports: number;
  scannedAircraft: number;
  flightsExamined: number;
  matches: number;
  mismatches: number;
  totalExpected: number;
  totalAttributed: number;
  rows: RevenueConsistencyRow[];
};

export const getRevenueConsistencyCheck = createServerFn({ method: "GET" })
  .inputValidator(
    (d?: { adminToken?: string; username?: string; nonce?: string; pages?: number }) =>
      d ?? {},
  )
  .handler(async ({ data }): Promise<RevenueConsistencyReport> => {
    // Admin-only: revenue audit is an operational tool, not a public report.
    const expected = process.env.ADMIN_TOKEN;
    if (!expected) throw new Error("ADMIN_TOKEN is not configured on the server.");
    const { createHash, timingSafeEqual } = await import("node:crypto");
    const provided = createHash("sha256").update(String(data.adminToken ?? ""), "utf8").digest();
    const known = createHash("sha256").update(expected, "utf8").digest();
    if (!timingSafeEqual(provided, known)) throw new Error("Forbidden: admin token required.");
    const { username, nonce } = await resolveIdentity(data);
    const qs = `username=${encodeURIComponent(username)}&nonce=${encodeURIComponent(nonce)}`;
    const meLc = username.toLowerCase();
    const PAGES = Math.min(Math.max(data.pages ?? 25, 1), 40);

    const assets = await fetchJSON<RawAssetsAll>(`${SIMFLY_BASE}/user/assets/all?${qs}`);
    const airportIcaos: string[] = [];
    const airplaneIds: string[] = [];
    for (const it of assets?.items ?? []) {
      if (it.type === "Airport" && it.icao) airportIcaos.push(it.icao);
      else if (it.type === "Airplane" && it.aircraftId) airplaneIds.push(it.aircraftId);
    }
    const ownsAirport = new Set(airportIcaos.map((i) => i.toUpperCase()));

    type Acc = {
      raw: RawAirportHistFlight;
      sources: Set<"airport" | "aircraft">;
      attributedAirport: number;  // sum we'd credit through airport feed
      attributedAircraft: number; // we'd credit through aircraft feed
    };
    const map = new Map<string, Acc>();

    const airportScans = airportIcaos.map(async (icao) => {
      const urls = Array.from({ length: PAGES }, (_, i) =>
        `${SIMFLY_BASE}/user/assets/airport/${encodeURIComponent(icao)}/flights?username=${encodeURIComponent(username)}&nonce=${encodeURIComponent(nonce)}&page=${i + 1}`,
      );
      const pages = await Promise.all(urls.map((u) => fetchJSON<RawAirportHistPage>(u)));
      for (const r of pages) {
        if (!r) continue;
        for (const raw of r.flights ?? []) {
          if (!raw.flightID) continue;
          const pilot = raw.pilot?.username ?? "";
          if (pilot.toLowerCase() === meLc) continue;
          const role: "takeoff" | "landing" = raw.origin?.icao === icao ? "takeoff" : "landing";
          const slot = role === "takeoff" ? raw.origin : raw.destination;
          const credit = slot?.totalEarnedPax ?? slot?.earnedPax ?? 0;
          const entry = map.get(raw.flightID) ?? {
            raw,
            sources: new Set(),
            attributedAirport: 0,
            attributedAircraft: 0,
          };
          entry.sources.add("airport");
          entry.attributedAirport += credit;
          map.set(raw.flightID, entry);
        }
      }
    });

    const aircraftScans = airplaneIds.map(async (id) => {
      const urls = Array.from({ length: PAGES }, (_, i) =>
        `${SIMFLY_BASE}/user/assets/airplane/${encodeURIComponent(id)}/flights?page=${i + 1}`,
      );
      const pages = await Promise.all(urls.map((u) => fetchJSON<RawAirportHistPage>(u)));
      for (const r of pages) {
        if (!r) continue;
        for (const raw of r.flights ?? []) {
          if (!raw.flightID) continue;
          const pilot = raw.pilot?.username ?? "";
          if (pilot.toLowerCase() === meLc) continue;
          if ((raw.airplane?.owner?.username ?? "").toLowerCase() !== meLc) continue;
          const credit = raw.airplane?.totalEarnedPax ?? raw.airplane?.earnedPax ?? 0;
          const entry = map.get(raw.flightID) ?? {
            raw,
            sources: new Set(),
            attributedAirport: 0,
            attributedAircraft: 0,
          };
          entry.sources.add("aircraft");
          // Take max — same flight may surface twice across pages; per-flight value is stable.
          entry.attributedAircraft = Math.max(entry.attributedAircraft, credit);
          map.set(raw.flightID, entry);
        }
      }
    });

    await Promise.all([...airportScans, ...aircraftScans]);

    const rows: RevenueConsistencyRow[] = [];
    let totalExpected = 0;
    let totalAttributed = 0;
    let mismatches = 0;

    for (const [flightID, acc] of map) {
      const raw = acc.raw;
      const originIcao = (raw.origin?.icao ?? "").toUpperCase();
      const destIcao = (raw.destination?.icao ?? "").toUpperCase();
      const ownsOrigin = !!originIcao && ownsAirport.has(originIcao);
      const ownsDest = !!destIcao && ownsAirport.has(destIcao);
      const ownsAircraft = (raw.airplane?.owner?.username ?? "").toLowerCase() === meLc;

      const expectedAirport =
        (ownsOrigin ? raw.origin?.totalEarnedPax ?? raw.origin?.earnedPax ?? 0 : 0) +
        (ownsDest ? raw.destination?.totalEarnedPax ?? raw.destination?.earnedPax ?? 0 : 0);
      const expectedAircraft = ownsAircraft
        ? raw.airplane?.totalEarnedPax ?? raw.airplane?.earnedPax ?? 0
        : 0;

      const round = (n: number) => Math.round(n * 1000) / 1000;
      const ea = round(expectedAirport);
      const eac = round(expectedAircraft);
      const aa = round(acc.attributedAirport);
      const aac = round(acc.attributedAircraft);
      const expectedTotal = round(ea + eac);
      const attributedTotal = round(aa + aac);
      const diff = round(attributedTotal - expectedTotal);

      totalExpected += expectedTotal;
      totalAttributed += attributedTotal;
      if (Math.abs(diff) > 0.01) mismatches++;

      rows.push({
        flightID,
        ts: raw.departureTime ?? raw.takeoffTime ?? raw.landingTime ?? "",
        pilot: raw.pilot?.username ?? "",
        origin: originIcao,
        destination: destIcao,
        aircraft: raw.airplane?.name ?? "",
        ownsOrigin,
        ownsDestination: ownsDest,
        ownsAircraft,
        expectedAirport: ea,
        expectedAircraft: eac,
        attributedAirport: aa,
        attributedAircraft: aac,
        expectedTotal,
        attributedTotal,
        diff,
        sources: Array.from(acc.sources),
      });
    }

    rows.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff) || (b.ts > a.ts ? 1 : -1));

    return {
      username,
      checkedAt: new Date().toISOString(),
      scannedAirports: airportIcaos.length,
      scannedAircraft: airplaneIds.length,
      flightsExamined: rows.length,
      matches: rows.length - mismatches,
      mismatches,
      totalExpected: Math.round(totalExpected * 100) / 100,
      totalAttributed: Math.round(totalAttributed * 100) / 100,
      rows,
    };
  });



// Lightweight session/health check.
export type SimflySessionStatus = {
  status: "ok" | "missing" | "unauthorized" | "error";
  httpStatus?: number;
  message: string;
  checkedAt: string;
  username?: string;
};

export const checkSimflySession = createServerFn({ method: "GET" }).handler(
  async (): Promise<SimflySessionStatus> => {
    const checkedAt = new Date().toISOString();
    const { username, nonce } = identity();
    // Never include the configured username or nonce in user-facing messages —
    // this endpoint is unauthenticated, so any leak is publicly accessible.
    if (!username || !nonce) {
      return {
        status: "missing",
        message: "SimFly credentials are not configured on the server.",
        checkedAt,
      };
    }
    try {
      const res = await fetch(
        `${SIMFLY_BASE}/user/v2/?nonce=${encodeURIComponent(nonce)}&username=${encodeURIComponent(username)}`,
        { headers: { Accept: "application/json" } },
      );
      if (res.ok) {
        return {
          status: "ok",
          httpStatus: res.status,
          message: "Live SimFly data is available.",
          checkedAt,
        };
      }
      if (res.status === 404) {
        return {
          status: "missing",
          httpStatus: 404,
          message: "Configured SimFly account was not found upstream.",
          checkedAt,
        };
      }
      return {
        status: "error",
        httpStatus: res.status,
        message: `SimFly returned HTTP ${res.status}.`,
        checkedAt,
      };
    } catch {
      return {
        status: "error",
        message: "Could not reach SimFly.",
        checkedAt,
      };
    }
  },
);

// ----- Airport coordinate lookup (lazy-loaded OpenFlights dataset) -----

export type AirportGeo = { icao: string; lat: number; lon: number; name: string };

const OPENFLIGHTS_URL =
  "https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.dat";

let GEO_CACHE: Map<string, AirportGeo> | null = null;
let GEO_LOAD: Promise<Map<string, AirportGeo>> | null = null;

async function loadGeo(): Promise<Map<string, AirportGeo>> {
  if (GEO_CACHE) return GEO_CACHE;
  if (GEO_LOAD) return GEO_LOAD;
  GEO_LOAD = (async () => {
    const res = await fetch(OPENFLIGHTS_URL);
    const text = await res.text();
    const map = new Map<string, AirportGeo>();
    for (const line of text.split("\n")) {
      // CSV with quoted fields. Simple parser since OpenFlights uses standard quoting.
      const cols: string[] = [];
      let cur = "";
      let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') inQ = !inQ;
        else if (c === "," && !inQ) {
          cols.push(cur);
          cur = "";
        } else cur += c;
      }
      cols.push(cur);
      if (cols.length < 8) continue;
      const name = cols[1];
      const icao = cols[5];
      const lat = Number(cols[6]);
      const lon = Number(cols[7]);
      if (!icao || icao === "\\N" || icao.length !== 4) continue;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      map.set(icao.toUpperCase(), { icao, lat, lon, name });
    }
    GEO_CACHE = map;
    return map;
  })();
  return GEO_LOAD;
}

export const getAirportGeo = createServerFn({ method: "GET" })
  .inputValidator((d: { icaos: string[] }) => d)
  .handler(async ({ data }): Promise<AirportGeo[]> => {
    const map = await loadGeo();
    const out: AirportGeo[] = [];
    const seen = new Set<string>();
    for (const raw of data.icaos) {
      const k = (raw || "").toUpperCase();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      const hit = map.get(k);
      if (hit) out.push(hit);
    }
    return out;
  });

// Per-asset detail JSON (raw passthrough).
export const getSimflyAssetDetail = createServerFn({ method: "GET" })
  .inputValidator((d: { kind: "airport" | "airplane"; key: string }) => {
    if (d?.kind !== "airport" && d?.kind !== "airplane") {
      throw new Error("Invalid kind — must be 'airport' or 'airplane'");
    }
    if (typeof d.key !== "string" || !d.key.trim()) {
      throw new Error("Missing asset key");
    }
    return { kind: d.kind, key: d.key };
  })
  .handler(async ({ data }): Promise<{ kind: string; key: string; json: string }> => {
    const url = `${SIMFLY_BASE}/user/assets/details/${data.kind}/${encodeURIComponent(data.key)}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`SimFly asset ${data.kind}/${data.key} not found`);
    const text = await res.text();
    return { kind: data.kind, key: data.key, json: text };
  });

// LIVE visitors currently flying through one of my airports.
export const getAirportVisitors = createServerFn({ method: "GET" })
  .inputValidator((d: { icao: string; username?: string }) => d)
  .handler(async ({ data }): Promise<AirportLiveVisitor[]> => {
    const { username } = identity({ username: data.username });
    const res = await fetchJSON<{ data: RawLiveFlight[] }>(
      `${SIMFLY_BASE}/asset/airport/${encodeURIComponent(data.icao)}/flights`,
    );
    const list = res?.data ?? [];
    return list
      .filter((f) => f.username?.toLowerCase() !== username.toLowerCase())
      .filter((f) => f.originICAO === data.icao || f.destinationICAO === data.icao)
      .map((f) => ({
        id: f.id,
        username: f.username,
        usernonce: f.usernonce,
        userAvatar: f.userAvatar,
        aircraftName: f.aircraftName,
        aircraftICAO: f.aircraftICAO,
        origin: f.originICAO,
        destination: f.destinationICAO,
        sim: f.simKind,
        tailNumber: f.tailNumber,
      }));
  });

// My OWN aircraft currently airborne. Polls the live feed of every owned hub
// in parallel and filters where the flying username matches me. A flight is
// reported once even if it appears on both origin and destination feeds.
export const getMyLiveFlights = createServerFn({ method: "GET" })
  .inputValidator((d: { icaos: string[]; username?: string; tails?: string[]; includeUnmatched?: boolean }) => d)
  .handler(async ({ data }): Promise<MyLiveFlight[]> => {
    const { username } = identity({ username: data.username });
    const icaos = (data.icaos ?? []).filter(Boolean).slice(0, 24);
    const myTails = new Set((data.tails ?? []).filter(Boolean).map((t) => t.toLowerCase()));
    const includeUnmatched = !!data.includeUnmatched;
    const results = await Promise.all(
      icaos.map(async (icao) => {
        try {
          const res = await fetchJSON<{ data: RawLiveFlight[] }>(
            `${SIMFLY_BASE}/asset/airport/${encodeURIComponent(icao)}/flights`,
          );
          return { icao, list: res?.data ?? [] };
        } catch {
          return { icao, list: [] as RawLiveFlight[] };
        }
      }),
    );
    const seen = new Map<string, MyLiveFlight>();
    const me = username.toLowerCase();
    const geo = await loadGeo().catch(() => new Map());
    for (const { icao, list } of results) {
      for (const f of list) {
        const isMine = f.username?.toLowerCase() === me;
        const isMyPlane = !!f.tailNumber && myTails.has(f.tailNumber.toLowerCase());
        if (!isMine && !isMyPlane && !includeUnmatched) continue;
        if (seen.has(f.id)) continue;
        const departureMs = (f.startTime ? Date.parse(f.startTime) : NaN) || uuidV7Ms(f.id) || undefined;
        const o = f.originICAO ? geo.get(f.originICAO.toUpperCase()) : undefined;
        const d = f.destinationICAO ? geo.get(f.destinationICAO.toUpperCase()) : undefined;
        const eta = departureMs ? computeEta({ departureMs, origin: o, destination: d, aircraftICAO: f.aircraftICAO, flightId: f.flightNumber ?? f.id, debug: true }) : null;
        seen.set(f.id, {
          id: f.id,
          aircraftICAO: f.aircraftICAO,
          aircraftName: f.aircraftName,
          tailNumber: f.tailNumber,
          origin: f.originICAO,
          destination: f.destinationICAO,
          sim: f.simKind,
          observedAt: icao,
          licenceCode: f.licence || undefined,
          pilotUsername: f.username,
          departureMs,
          etaMs: eta?.etaMs,
          distanceNm: eta?.distanceNm,
        });
      }
    }
    return Array.from(seen.values());
  });

// For each of my hubs, return live visitor flights from OTHER pilots that are
// inbound to (or departing from) the hub right now. Hubs with zero visitor
// traffic are omitted so the UI can render only the active ones.
export type MyHubIncomingTraffic = {
  icao: string;
  visitors: AirportLiveVisitor[];
};
export const getMyHubsIncomingTraffic = createServerFn({ method: "GET" })
  .inputValidator((d: { icaos: string[]; username?: string }) => d)
  .handler(async ({ data }): Promise<MyHubIncomingTraffic[]> => {
    const { username } = identity({ username: data.username });
    const me = username.toLowerCase();
    const icaos = (data.icaos ?? []).filter(Boolean).slice(0, 24);
    const geo = await loadGeo().catch(() => new Map());
    const results = await Promise.all(
      icaos.map(async (icao) => {
        const res = await fetchJSON<{ data: RawLiveFlight[] }>(
          `${SIMFLY_BASE}/asset/airport/${encodeURIComponent(icao)}/flights`,
        );
        const list = (res?.data ?? [])
          .filter((f) => f.username?.toLowerCase() !== me)
          .filter((f) => f.destinationICAO === icao || f.originICAO === icao)
          .map<AirportLiveVisitor>((f) => {
            const departureMs = (f.startTime ? Date.parse(f.startTime) : NaN) || uuidV7Ms(f.id) || undefined;
            const o = f.originICAO ? geo.get(f.originICAO.toUpperCase()) : undefined;
            const d = f.destinationICAO ? geo.get(f.destinationICAO.toUpperCase()) : undefined;
            const eta = departureMs ? computeEta({ departureMs, origin: o, destination: d, aircraftICAO: f.aircraftICAO, flightId: f.flightNumber ?? f.id, debug: true }) : null;
            return {
              id: f.id,
              username: f.username,
              usernonce: f.usernonce,
              userAvatar: f.userAvatar,
              aircraftName: f.aircraftName,
              aircraftICAO: f.aircraftICAO,
              origin: f.originICAO,
              destination: f.destinationICAO,
              sim: f.simKind,
              tailNumber: f.tailNumber,
              departureMs,
              etaMs: eta?.etaMs,
              distanceNm: eta?.distanceNm,
            };
          });
        // De-dupe by flight id (same flight can appear on both endpoints).
        const seen = new Map<string, AirportLiveVisitor>();
        for (const v of list) if (!seen.has(v.id)) seen.set(v.id, v);
        return { icao, visitors: Array.from(seen.values()) };
      }),
    );
    return results.filter((r) => r.visitors.length > 0);
  });

// ----- Public historical flight log per airport -----
// SimFly exposes /api/user/assets/airport/{ICAO}/flights publicly. itemPerPage is
// fixed at 4. We page through it to estimate visitor revenue.

type RawAirportHistFlight = {
  flightID: string;
  departureTime?: string;
  takeoffTime?: string;
  landingTime?: string;
  pax?: number;
  xp?: number;
  distance?: number;
  flightDistance?: number;
  totalDistance?: number;
  pilot?: { username?: string };
  airplane?: { name?: string; icao?: string; aircraftId?: string; category?: number; level?: number; owner?: { username?: string }; earnedPax?: number; totalEarnedPax?: number; bonusPax?: number };
  origin?: { icao?: string; category?: number; level?: number; earnedPax?: number; totalEarnedPax?: number; bonusPax?: number; percToUser?: number };
  destination?: { icao?: string; category?: number; level?: number; earnedPax?: number; totalEarnedPax?: number; bonusPax?: number; percToUser?: number };

};

type RawAirportHistFlightWithLicence = RawAirportHistFlight & {
  licence?: { code?: string; earnedXp?: number; owner?: { username?: string } };
};

type RawAirportHistPage = {
  page: number;
  itemPerPage: number;
  takeoff?: { totalFlights: number };
  landing?: { totalFlights: number };
  flights: RawAirportHistFlight[];
};

function normaliseHistFlight(
  raw: RawAirportHistFlight,
  icao: string,
  me: string,
): AirportFlightHistoryItem | null {
  if (!raw.flightID) return null;
  const visitor = raw.pilot?.username ?? raw.airplane?.owner?.username ?? "";
  if (!visitor) return null;
  const ts = raw.departureTime ?? raw.takeoffTime ?? raw.landingTime ?? "";
  const origin = raw.origin?.icao ?? "";
  const destination = raw.destination?.icao ?? "";
  const role: "takeoff" | "landing" = origin === icao ? "takeoff" : "landing";
  const paxAirport =
    role === "takeoff"
      ? raw.origin?.totalEarnedPax ?? raw.origin?.earnedPax ?? 0
      : raw.destination?.totalEarnedPax ?? raw.destination?.earnedPax ?? 0;
  const aircraftOwner = raw.airplane?.owner?.username ?? "";
  const aircraftIsMine = aircraftOwner.toLowerCase() === me.toLowerCase();
  const paxAircraft = aircraftIsMine
    ? raw.airplane?.totalEarnedPax ?? raw.airplane?.earnedPax ?? 0
    : 0;
  return {
    id: raw.flightID,
    ts,
    visitor,
    isOwner: visitor.toLowerCase() === me.toLowerCase(),
    role,
    otherIcao: role === "takeoff" ? destination : origin,
    paxVisitor: raw.pax ?? 0,
    paxAirport,
    paxAircraft,
    aircraft: raw.airplane?.name ?? "",
  };
}

export const getAirportFlightHistory = createServerFn({ method: "GET" })
  .inputValidator((d: { icao: string; pages?: number; username?: string }) => d)
  .handler(async ({ data }): Promise<{
    icao: string;
    items: AirportFlightHistoryItem[];
    totalLandings: number;
    totalTakeoffs: number;
    pagesFetched: number;
  }> => {
    const { username, nonce } = await resolveIdentity({ username: data.username });
    const pages = Math.min(Math.max(data.pages ?? 5, 1), 25);
    const urls = Array.from({ length: pages }, (_, i) =>
      `${SIMFLY_BASE}/user/assets/airport/${encodeURIComponent(data.icao)}/flights?username=${encodeURIComponent(username)}&nonce=${encodeURIComponent(nonce)}&page=${i + 1}`,
    );
    const responses = await Promise.all(urls.map((u) => fetchJSON<RawAirportHistPage>(u)));
    const items: AirportFlightHistoryItem[] = [];
    let totalLandings = 0;
    let totalTakeoffs = 0;
    for (const r of responses) {
      if (!r) continue;
      totalLandings = r.landing?.totalFlights ?? totalLandings;
      totalTakeoffs = r.takeoff?.totalFlights ?? totalTakeoffs;
      for (const f of r.flights ?? []) {
        const n = normaliseHistFlight(f, data.icao, username);
        if (n) items.push(n);
      }
    }
    return { icao: data.icao, items, totalLandings, totalTakeoffs, pagesFetched: pages };
  });

export const getVisitorHistory = createServerFn({ method: "GET" })
  .inputValidator((d?: { pages?: number; username?: string }) => d ?? {})
  .handler(async ({ data }): Promise<VisitorHistoryPayload> => {
    const { username, nonce } = await resolveIdentity({ username: data?.username });
    const pagesPerAirport = Math.min(Math.max(data?.pages ?? 5, 1), 25);

    // Discover my airports.
    const assets = await fetchJSON<RawAssetsAll>(
      `${SIMFLY_BASE}/user/assets/all?username=${encodeURIComponent(username)}&nonce=${encodeURIComponent(nonce)}`,
    );
    const icaos = (assets?.items ?? [])
      .filter((it): it is RawAssetAirport => it.type === "Airport")
      .map((it) => it.icao);

    // Page through every airport in parallel.
    const perAirport = await Promise.all(
      icaos.map(async (icao) => {
        const urls = Array.from({ length: pagesPerAirport }, (_, i) =>
          `${SIMFLY_BASE}/user/assets/airport/${encodeURIComponent(icao)}/flights?username=${encodeURIComponent(username)}&nonce=${encodeURIComponent(nonce)}&page=${i + 1}`,
        );
        const pages = await Promise.all(urls.map((u) => fetchJSON<RawAirportHistPage>(u)));
        const items: AirportFlightHistoryItem[] = [];
        let totalLandings = 0;
        let totalTakeoffs = 0;
        for (const r of pages) {
          if (!r) continue;
          totalLandings = r.landing?.totalFlights ?? totalLandings;
          totalTakeoffs = r.takeoff?.totalFlights ?? totalTakeoffs;
          for (const f of r.flights ?? []) {
            const n = normaliseHistFlight(f, icao, username);
            if (n) items.push(n);
          }
        }
        return { icao, items, totalLandings, totalTakeoffs };
      }),
    );

    // Aggregate per visitor across all airports.
    const now = Date.now();
    const wk = now - 7 * 86_400_000;
    const mo = now - 30 * 86_400_000;
    const byVisitor = new Map<string, VisitorContribution>();
    for (const a of perAirport) {
      for (const f of a.items) {
        // include self — pilot's own flights through their hubs count toward visits
        const tsMs = new Date(f.ts).getTime();
        const cur =
          byVisitor.get(f.visitor) ?? ({
            handle: f.visitor,
            visits: 0,
            paxForMe: 0,
            paxForVisitor: 0,
            paxForMe7d: 0,
            paxForVisitor7d: 0,
            paxForMe30d: 0,
            paxForVisitor30d: 0,
            airports: [] as VisitorAirportBreakdown[],
            lastSeenAt: f.ts,
            firstSeenAt: f.ts,
          } satisfies VisitorContribution);
        cur.visits += 1;
        cur.paxForMe += f.paxAirport;
        cur.paxForVisitor += f.paxVisitor;
        if (Number.isFinite(tsMs)) {
          if (tsMs >= mo) {
            cur.paxForMe30d += f.paxAirport;
            cur.paxForVisitor30d += f.paxVisitor;
          }
          if (tsMs >= wk) {
            cur.paxForMe7d += f.paxAirport;
            cur.paxForVisitor7d += f.paxVisitor;
          }
          if (new Date(cur.lastSeenAt).getTime() < tsMs) cur.lastSeenAt = f.ts;
          if (new Date(cur.firstSeenAt).getTime() > tsMs) cur.firstSeenAt = f.ts;
        }
        let row = cur.airports.find((x) => x.icao === a.icao);
        if (!row) {
          row = { icao: a.icao, visits: 0, paxForMe: 0, paxForVisitor: 0 };
          cur.airports.push(row);
        }
        row.visits += 1;
        row.paxForMe += f.paxAirport;
        row.paxForVisitor += f.paxVisitor;
        byVisitor.set(f.visitor, cur);
      }
    }

    const visitors = [...byVisitor.values()].sort((a, b) => b.paxForMe - a.paxForMe);

    return {
      visitors,
      scannedAirports: perAirport.map((a) => ({
        icao: a.icao,
        flightsSampled: a.items.length,
        totalLandings: a.totalLandings,
        totalTakeoffs: a.totalTakeoffs,
      })),
      pagesPerAirport,
      fetchedAt: new Date().toISOString(),
    };
  });

// ===== Airport flat PAX payout matrix =====
// Estimates the base per-flight PAX payout an airport pays out per aircraft
// Tier (category) × Level by sampling the airport's public flight log and
// excluding any flight that received a bonus multiplier (weekly 3× etc.).

export type PayoutMatrixFlight = {
  flightId: string;
  ts: string;
  role: "takeoff" | "landing";
  otherIcao: string;
  distanceNm?: number;
  aircraftName: string;
  tailNumber?: string;
  pilot: string;
  basePax: number;
  bonusPax: number;
  totalPax: number;
};

export type PayoutMatrixCell = {
  tier: number;
  level: number;
  avgPax: number;
  flights: number;
  samples: PayoutMatrixFlight[];
};

export type AirportPayoutMatrix = {
  icao: string;
  pagesFetched: number;
  flightsSampled: number;
  flightsUsed: number;
  flightsExcluded: number;
  tiers: number[];
  levels: number[];
  cells: PayoutMatrixCell[];
  fetchedAt: string;
};

export const getAirportPayoutMatrix = createServerFn({ method: "GET" })
  .inputValidator((d: { icao: string; pages?: number; username?: string }) => d)
  .handler(async ({ data }): Promise<AirportPayoutMatrix> => {
    const { username, nonce } = await resolveIdentity({ username: data.username });
    const pages = Math.min(Math.max(data.pages ?? 50, 1), 120);
    const urls = Array.from({ length: pages }, (_, i) =>
      `${SIMFLY_BASE}/user/assets/airport/${encodeURIComponent(data.icao)}/flights?username=${encodeURIComponent(username)}&nonce=${encodeURIComponent(nonce)}&page=${i + 1}`,
    );
    const responses = await fetchJSONPages<RawAirportHistPage>(urls, 4);

    type Bucket = { sum: number; n: number; samples: PayoutMatrixFlight[] };
    const buckets = new Map<string, Bucket>();
    const tierSet = new Set<number>();
    const levelSet = new Set<number>();
    let sampled = 0;
    let used = 0;
    let excluded = 0;
    let consecutiveEmpty = 0;

    for (const r of responses) {
      if (!r?.flights?.length) {
        consecutiveEmpty++;
        if (consecutiveEmpty >= 3) break;
        continue;
      }
      consecutiveEmpty = 0;
      for (const f of r.flights as RawAirportHistFlight[]) {
        sampled++;
        const isOrigin = f.origin?.icao === data.icao;
        const side = isOrigin ? f.origin : f.destination;
        if (!side) { excluded++; continue; }

        // Include EVERY completed flight. The Weekly Cycle First Movement
        // (3×) bonus is a separate transaction stored in `bonusPax`; the
        // standard "Airport Profit Split" payout lives in `earnedPax`. Use
        // `earnedPax` as the base payout and simply ignore the bonus
        // transaction — flights are NOT excluded just because they got a
        // bonus. Defensive fallback: if a payload only exposes
        // `totalEarnedPax` + `bonusPax`, derive base by subtraction.
        const bonus = side.bonusPax ?? 0;
        let earned = side.earnedPax ?? 0;
        if (earned <= 0 && (side.totalEarnedPax ?? 0) > 0) {
          earned = Math.max(0, (side.totalEarnedPax ?? 0) - bonus);
        }
        if (earned <= 0) { excluded++; continue; }

        const tier = f.airplane?.category;
        const level = f.airplane?.level;
        if (!tier || !level) { excluded++; continue; }

        tierSet.add(tier);
        levelSet.add(level);
        const key = `${tier}:${level}`;
        const b = buckets.get(key) ?? { sum: 0, n: 0, samples: [] };
        b.sum += earned;
        b.n += 1;
        b.samples.push({
          flightId: f.flightID,
          ts: f.landingTime ?? f.takeoffTime ?? f.departureTime ?? "",
          role: isOrigin ? "takeoff" : "landing",
          otherIcao: (isOrigin ? f.destination?.icao : f.origin?.icao) ?? "—",
          distanceNm: f.distance ?? f.flightDistance ?? f.totalDistance,
          aircraftName: f.airplane?.name ?? f.airplane?.icao ?? "—",
          tailNumber: (f.airplane as { tailNumber?: string } | undefined)?.tailNumber,
          pilot: f.pilot?.username ?? f.airplane?.owner?.username ?? "—",
          basePax: earned,
          bonusPax: bonus,
          totalPax: side.totalEarnedPax ?? (earned + bonus),
        });
        buckets.set(key, b);
        used++;
      }
    }

    const cells: PayoutMatrixCell[] = [];
    for (const [key, b] of buckets) {
      const [tier, level] = key.split(":").map(Number);
      // Sort samples newest first, cap to keep payload small.
      const samples = b.samples
        .sort((a, b) => (b.ts > a.ts ? 1 : b.ts < a.ts ? -1 : 0))
        .slice(0, 200);
      cells.push({ tier, level, avgPax: b.sum / b.n, flights: b.n, samples });
    }

    return {
      icao: data.icao,
      pagesFetched: pages,
      flightsSampled: sampled,
      flightsUsed: used,
      flightsExcluded: excluded,
      tiers: [...tierSet].sort((a, b) => a - b),
      levels: [...levelSet].sort((a, b) => a - b),
      cells,
      fetchedAt: new Date().toISOString(),
    };
  });


/**
 * Lightweight estimate of how big the historical backfill will be.
 * Hits page 1 of the logbook and the assets list (both cheap) to compute
 * total logbook pages and the number of owned airplanes the heavy backfill
 * will scan. Used by the client to render an import-progress indicator
 * while getSimflyPayload is in flight.
 */
export const getBackfillEstimate = createServerFn({ method: "GET" })
  .inputValidator((d?: { username?: string; nonce?: string }) => d ?? {})
  .handler(async ({ data }) => {
    const { username, nonce } = await resolveIdentity(data);
    const qs = `username=${encodeURIComponent(username)}&nonce=${encodeURIComponent(nonce)}`;
    const [p1, assets] = await Promise.all([
      fetchJSON<RawFlightsPage>(`${SIMFLY_BASE}/user/flights?${qs}&fpage=1`),
      fetchJSON<RawAssetsAll>(`${SIMFLY_BASE}/user/assets/all?${qs}`),
    ]);
    const logbookPages = Math.max(1, Math.min(1000, Number(p1?.totalPages) || 1));
    const airplanes = (assets?.items ?? []).filter((a) => a?.type === "Airplane").length;
    // Heavy backfill scans up to AIRCRAFT_BACKFILL_PAGE_LIMIT pages per plane,
    // but most planes finish far earlier. Use a soft estimate of ~12 pages/plane
    // for time projection only — pagesTotal exposes the true ceiling.
    const aircraftPagesEstimate = airplanes * 12;
    return {
      username,
      logbookPages,
      airplanes,
      aircraftPagesEstimate,
      pagesTotal: logbookPages + aircraftPagesEstimate,
      fetchedAt: new Date().toISOString(),
    };
  });

// ===== Compare-hubs: lookup any airport in SimFly by ICAO =====

/** Suggest airports by ICAO prefix or name substring from the OpenFlights geo dataset. */
export const searchAirports = createServerFn({ method: "GET" })
  .inputValidator((d: { query: string; limit?: number }) => d)
  .handler(async ({ data }): Promise<{ icao: string; name: string }[]> => {
    const q = (data.query ?? "").trim().toUpperCase();
    if (q.length < 1) return [];
    const limit = Math.min(Math.max(data.limit ?? 8, 1), 25);
    const map = await loadGeo();
    const prefix: { icao: string; name: string }[] = [];
    const contains: { icao: string; name: string }[] = [];
    for (const g of map.values()) {
      const icao = g.icao.toUpperCase();
      if (icao.startsWith(q)) prefix.push({ icao, name: g.name });
      else if (icao.includes(q) || g.name.toUpperCase().includes(q))
        contains.push({ icao, name: g.name });
      if (prefix.length >= limit) break;
    }
    return [...prefix, ...contains].slice(0, limit);
  });

/** Fetch any SimFly airport (owned or not) and return an AirportExt shell.
 * 7d/30d roll-ups are zero because they require the viewer's per-flight log. */
export const getAirportSummary = createServerFn({ method: "GET" })
  .inputValidator((d: { icao: string }) => d)
  .handler(async ({ data }): Promise<AirportExt | null> => {
    const icao = (data.icao ?? "").trim().toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(icao)) return null;
    const url = `${SIMFLY_BASE}/user/assets/details/airport/${encodeURIComponent(icao)}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`SimFly airport lookup failed (${res.status})`);
    const text = await res.text();
    let raw: RawAssetAirport;
    try {
      raw = JSON.parse(text) as RawAssetAirport;
    } catch {
      return null;
    }
    if (!raw || raw.type !== "Airport" || !raw.icao) return null;
    return mapAirport(raw, []);
  });

// ---- Weekly License Route Checker ------------------------------------------
// SimFly weekly cycle is Monday 00:00 UTC → Sunday 23:59:59 UTC.
export function currentSimflyWeekRangeUtc(now: Date = new Date()): { startIso: string; endIso: string } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  // getUTCDay: Sun=0..Sat=6 → days since Monday
  const dow = start.getUTCDay();
  const daysSinceMonday = (dow + 6) % 7;
  start.setUTCDate(start.getUTCDate() - daysSinceMonday);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  end.setUTCMilliseconds(end.getUTCMilliseconds() - 1);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

export type LicenceRouteCheckMatch = {
  flightId: string;
  completedAt: string;
  aircraft: string | null;
  aircraftTail: string | null;
  pilot: string;
  pax: number | null;
  xp: number | null;
  departure: string | null;
  arrival: string | null;
};

export type LicenceRouteCheckResult = {
  weekStart: string;
  weekEnd: string;
  licence: string;
  departure: string;
  arrival: string;
  matches: LicenceRouteCheckMatch[];
};

export const checkLicenceRoute = createServerFn({ method: "GET" })
  .inputValidator((d: { licence: string; departure: string; arrival: string; username?: string }) => d)
  .handler(async ({ data }): Promise<LicenceRouteCheckResult> => {
    const username = (data.username || defaultUsername()).trim();
    const licence = (data.licence || "").trim().toUpperCase();
    const departure = (data.departure || "").trim().toUpperCase();
    const arrival = (data.arrival || "").trim().toUpperCase();
    const { startIso, endIso } = currentSimflyWeekRangeUtc();
    const empty: LicenceRouteCheckResult = {
      weekStart: startIso,
      weekEnd: endIso,
      licence,
      departure,
      arrival,
      matches: [],
    };
    if (!licence || !/^[A-Z0-9]{4}$/.test(departure) || !/^[A-Z0-9]{4}$/.test(arrival)) return empty;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("simfly_flights")
      .select("flight_id,mission_start_ts,aircraft,aircraft_tail_number,username,pax,xp,licence")
      .eq("username", username)
      .eq("licence", licence)
      .eq("departure_icao", departure)
      .eq("destination_icao", arrival)
      .gte("mission_start_ts", startIso)
      .lte("mission_start_ts", endIso)
      .order("mission_start_ts", { ascending: false })
      .limit(50);
    if (error) {
      console.warn("[simfly] checkLicenceRoute failed", error);
      return empty;
    }
    return {
      ...empty,
      matches: (rows ?? []).map((r) => ({
        flightId: r.flight_id as string,
        completedAt: (r.mission_start_ts as string) ?? "",
        aircraft: (r.aircraft as string | null) ?? null,
        aircraftTail: (r.aircraft_tail_number as string | null) ?? null,
        pilot: (r.username as string) ?? username,
        pax: r.pax as number | null,
        xp: r.xp as number | null,
        departure: departure,
        arrival: arrival,
      })),
    };
  });

export type LicenceRouteStatus = {
  licence: string;
  used: boolean;
  match: LicenceRouteCheckMatch | null;
};

export type RouteLicenceEvaluation = {
  weekStart: string;
  weekEnd: string;
  departure: string;
  arrival: string;
  licences: LicenceRouteStatus[];
};

export const evaluateRouteForAllLicences = createServerFn({ method: "GET" })
  .inputValidator((d: { departure: string; arrival: string; licences: string[]; username?: string }) => d)
  .handler(async ({ data }): Promise<RouteLicenceEvaluation> => {
    const username = (data.username || defaultUsername()).trim();
    const departure = (data.departure || "").trim().toUpperCase();
    const arrival = (data.arrival || "").trim().toUpperCase();
    const codes = Array.from(
      new Set((data.licences || []).map((c) => (c || "").trim().toUpperCase()).filter(Boolean)),
    );
    const { startIso, endIso } = currentSimflyWeekRangeUtc();
    const base: RouteLicenceEvaluation = {
      weekStart: startIso,
      weekEnd: endIso,
      departure,
      arrival,
      licences: codes.map((c) => ({ licence: c, used: false, match: null })),
    };
    if (!/^[A-Z0-9]{4}$/.test(departure) || !/^[A-Z0-9]{4}$/.test(arrival) || codes.length === 0) {
      return base;
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const airports = Array.from(new Set([departure, arrival]));
    const { data: rows, error } = await supabaseAdmin
      .from("simfly_flights")
      .select("flight_id,mission_start_ts,aircraft,aircraft_tail_number,username,pax,xp,licence,departure_icao,destination_icao")
      .eq("username", username)
      .in("licence", codes)
      .or(`departure_icao.in.(${airports.join(",")}),destination_icao.in.(${airports.join(",")})`)
      .gte("mission_start_ts", startIso)
      .lte("mission_start_ts", endIso)
      .order("mission_start_ts", { ascending: false });
    if (error) {
      console.warn("[simfly] evaluateRouteForAllLicences failed", error);
      return base;
    }
    const latest = new Map<string, LicenceRouteCheckMatch>();
    for (const r of rows ?? []) {
      const code = ((r.licence as string) || "").toUpperCase();
      if (!code || latest.has(code)) continue;
      latest.set(code, {
        flightId: r.flight_id as string,
        completedAt: (r.mission_start_ts as string) ?? "",
        aircraft: (r.aircraft as string | null) ?? null,
        aircraftTail: (r.aircraft_tail_number as string | null) ?? null,
        pilot: (r.username as string) ?? username,
        pax: r.pax as number | null,
        xp: r.xp as number | null,
        departure: (r.departure_icao as string | null) ?? null,
        arrival: (r.destination_icao as string | null) ?? null,
      });
    }
    return {
      ...base,
      licences: codes.map((c) => {
        const m = latest.get(c) ?? null;
        return { licence: c, used: !!m, match: m };
      }),
    };
  });

// ---- Airport Upgrade Advisor ------------------------------------------------
// ROI estimate per owned airport. We pull the user's recent (last 60d) flight
// history from `simfly_flights` and, for each airport, compute:
//   * arrivals per day  = count(flights touching airport) / windowDays
//   * base payout/flt   = trimmed mean of (raw pax * percToUser) — top 15% is
//                         dropped so the Weekly Cycle First-Movement 3× bonus
//                         (and other temporary multipliers) cannot inflate the
//                         long-term sustainable average.
// We then ask `airportUpgradeCost(tier, level+1)` + a fixed
// `PAYOUT_LEVEL_GROWTH` per-level bump to estimate daily / annual income
// uplift and payback period. Pure advisory — no game state is mutated.
export type UpgradeAdvisorRow = {
  icao: string;
  name: string;
  tier: number;
  level: number;
  nextLevel: number;
  windowDays: number;
  flightsSampled: number;
  arrivalsPerDay: number;
  avgBasePaxPerFlight: number;
  currentDailyPax: number;
  /** Extra daily PAX from the Weekly Cycle First-Movement ×3 bonus (assumed 1/week per airport). */
  bonusDailyPax: number;
  dailyIncrease: number;
  annualIncrease: number;
  upgradeCost: number;
  paybackDays: number; // Infinity-ish → -1 sentinel for JSON
  stars: 1 | 2 | 3 | 4 | 5;
  ratingLabel: string;
};

export type UpgradeAdvisorResult = {
  windowDays: number;
  generatedAt: string;
  rows: UpgradeAdvisorRow[];
};

export const getUpgradeAdvisor = createServerFn({ method: "GET" })
  .inputValidator(
    (d: {
      username?: string;
      airports: { icao: string; name: string; tier: number; level: number; percToUser: number }[];
      windowDays?: number;
    }) => d,
  )
  .handler(async ({ data }): Promise<UpgradeAdvisorResult> => {
    const { airportUpgradeCost, ratingForPaybackDays, PAYOUT_LEVEL_GROWTH } =
      await import("./airport-upgrade-costs");
    const username = (data.username || defaultUsername()).trim();
    const windowDays = Math.max(7, Math.min(180, Math.round(data.windowDays ?? 60)));
    const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();
    const icaos = Array.from(
      new Set((data.airports ?? []).map((a) => (a.icao || "").toUpperCase()).filter(Boolean)),
    );
    const empty: UpgradeAdvisorResult = {
      windowDays,
      generatedAt: new Date().toISOString(),
      rows: [],
    };
    if (icaos.length === 0) return empty;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("simfly_flights")
      .select("departure_icao,destination_icao,pax,mission_start_ts")
      .eq("username", username)
      .gte("mission_start_ts", since)
      .or(
        `departure_icao.in.(${icaos.join(",")}),destination_icao.in.(${icaos.join(",")})`,
      );
    if (error) {
      console.warn("[simfly] getUpgradeAdvisor query failed", error);
    }

    // Bucket pax-per-flight per airport (raw, share applied later per airport).
    const buckets = new Map<string, number[]>();
    for (const r of rows ?? []) {
      const pax = Number(r.pax) || 0;
      if (pax <= 0) continue;
      const dep = ((r.departure_icao as string) || "").toUpperCase();
      const dst = ((r.destination_icao as string) || "").toUpperCase();
      for (const icao of [dep, dst]) {
        if (!icao || !icaos.includes(icao)) continue;
        const arr = buckets.get(icao) ?? [];
        arr.push(pax);
        buckets.set(icao, arr);
      }
    }

    const trimmedMean = (vals: number[], dropTopPct = 0.15) => {
      if (vals.length === 0) return 0;
      if (vals.length < 4) {
        return vals.reduce((s, v) => s + v, 0) / vals.length;
      }
      const sorted = [...vals].sort((a, b) => a - b);
      const keep = Math.max(1, Math.floor(sorted.length * (1 - dropTopPct)));
      const kept = sorted.slice(0, keep);
      return kept.reduce((s, v) => s + v, 0) / kept.length;
    };

    const out: UpgradeAdvisorRow[] = data.airports.map((a) => {
      const icao = (a.icao || "").toUpperCase();
      const shareRaw = a.percToUser ?? 0;
      const share = shareRaw > 1 ? shareRaw / 100 : shareRaw;
      const samples = buckets.get(icao) ?? [];
      const avgRawPax = trimmedMean(samples);
      const avgBasePaxPerFlight = avgRawPax * share;
      const arrivalsPerDay = samples.length / windowDays;
      const currentDailyPax = arrivalsPerDay * avgBasePaxPerFlight;
      const dailyIncrease = currentDailyPax * PAYOUT_LEVEL_GROWTH;
      const annualIncrease = dailyIncrease * 365;
      const upgradeCost = airportUpgradeCost(a.tier, a.level + 1);
      const paybackDays = dailyIncrease > 0 ? upgradeCost / dailyIncrease : -1;
      const rating = ratingForPaybackDays(paybackDays > 0 ? paybackDays : Number.POSITIVE_INFINITY);
      return {
        icao,
        name: a.name,
        tier: a.tier,
        level: a.level,
        nextLevel: a.level + 1,
        windowDays,
        flightsSampled: samples.length,
        arrivalsPerDay,
        avgBasePaxPerFlight,
        currentDailyPax,
        dailyIncrease,
        annualIncrease,
        upgradeCost,
        paybackDays,
        stars: rating.stars,
        ratingLabel: rating.label,
      };
    });

    return { windowDays, generatedAt: new Date().toISOString(), rows: out };
  });


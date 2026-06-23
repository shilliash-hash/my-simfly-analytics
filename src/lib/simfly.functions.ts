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
import {
  mergeVisitorFlights,
  visitorPaxByDay,
  type VisitorFlightWithHub,
} from "./visitor-merge";

/**
 * SimFly.io public API wrapper. Every endpoint we hit is unauthenticated.
 *
 *  GET /api/user/v2/?nonce=&username=         profile (name, country, hub)
 *  GET /api/user/stats?nonce=&username=       lifetime rewards + flight stats
 *  GET /api/user/pax?nonce=&username=         available PAX wallet balance
 *  GET /api/user/assets/all?username=&nonce=  airports + airplanes + licences
 *  GET /api/user/flights?username=&nonce=&page=N   paginated logbook
 *  GET /api/user/badges?username=&nonce=      earned event badges
 *  GET /api/user/assets/details/airport/{ICAO}      airport detail
 *  GET /api/user/assets/details/airplane/{uuid}     airplane detail
 *  GET /api/asset/airport/{ICAO}/flights      LIVE flights touching airport
 */

const SIMFLY_BASE = "https://simfly.io/api";
const DEFAULT_USERNAME = "shill";
const DEFAULT_NONCE = "1697880083";
const FETCH_TIMEOUT_MS = 12_000;

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
    `${SIMFLY_BASE}/user/assets/all?username=${encodeURIComponent(me)}&nonce=${myNonce}`,
  );
  const anchor = (assets?.items ?? []).find(
    (it): it is RawAssetAirport => it.type === "Airport",
  );
  if (anchor) {
    for (let page = 1; page <= 6 && !nonceCache.has(key); page += 1) {
      const r = await fetchJSON<{ flights?: RawVisitorPilotShape[] }>(
        `${SIMFLY_BASE}/user/assets/airport/${encodeURIComponent(anchor.icao)}/flights?username=${encodeURIComponent(me)}&nonce=${myNonce}&page=${page}`,
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

async function resolveIdentity(input?: { username?: string; nonce?: string }) {
  const username = (input?.username || defaultUsername()).trim();
  if (input?.nonce) return { username, nonce: input.nonce };
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
  return {
    username,
    nonce: input?.nonce || (cached ? String(cached) : defaultNonce()),
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
  let pax7d = 0;
  let pax30d = 0;
  let flights7d = 0;
  for (const f of flights) {
    if (f.departure_icao !== a.icao && f.destination_icao !== a.icao) continue;
    const ts = new Date(f.mission_start_ts).getTime();
    if (Number.isFinite(ts)) {
      if (ts >= moAgo) pax30d += f.pax || 0;
      if (ts >= wkAgo) {
        pax7d += f.pax || 0;
        flights7d += 1;
      }
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
  // pilot after every split (base earnings + extraPax bonuses received from
  // airport / aircraft / licence owners). There is no "donation" on the
  // pilot side — those flow inbound. Real outbound donations belong to the
  // visitor-history view (other players flying through hubs I own).
  const map = new Map<string, EarningsPoint>();
  for (const f of flights) {
    const day = (f.mission_start_ts || "").slice(0, 10);
    if (!day) continue;
    const cur = map.get(day) ?? { date: day, pax: 0, paxKept: 0, paxDonated: 0, xp: 0 };
    const kept = f.pax || 0;
    cur.pax += kept;
    cur.paxKept = (cur.paxKept ?? 0) + kept;
    cur.xp += f.xp || 0;
    map.set(day, cur);
  }
  const today = new Date();
  const out: EarningsPoint[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
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

// ----- Server functions -----

export const getSimflyPayload = createServerFn({ method: "GET" })
  .inputValidator((d?: { username?: string; nonce?: string }) => d ?? {})
  .handler(async ({ data }): Promise<SimflyPayload> => {
    const { username, nonce } = await resolveIdentity(data);
    const qs = `username=${encodeURIComponent(username)}&nonce=${nonce}`;

    const [profile, stats, assets, availablePaxRaw, p1, p2, p3] = await Promise.all([
      fetchJSON<RawProfile>(`${SIMFLY_BASE}/user/v2/?nonce=${nonce}&username=${encodeURIComponent(username)}`),
      fetchJSON<RawStats>(`${SIMFLY_BASE}/user/stats?${qs}`),
      fetchJSON<RawAssetsAll>(`${SIMFLY_BASE}/user/assets/all?${qs}`),
      fetchText(`${SIMFLY_BASE}/user/pax?${qs}`),
      fetchJSON<RawFlightsPage>(`${SIMFLY_BASE}/user/flights?${qs}&page=1`),
      fetchJSON<RawFlightsPage>(`${SIMFLY_BASE}/user/flights?${qs}&page=2`),
      fetchJSON<RawFlightsPage>(`${SIMFLY_BASE}/user/flights?${qs}&page=3`),
    ]);

    if (!profile) {
      return { ...MOCK_PAYLOAD, _source: "mock", _stale: true };
    }

    const flights: RawFlightLite[] = Array.from(
      new Map(
        [
          ...(p1?.flights ?? []),
          ...(p2?.flights ?? []),
          ...(p3?.flights ?? []),
        ].map((flight) => [flight.id, flight]),
      ).values(),
    );

    const airports: AirportExt[] = [];
    const airplanes: AircraftExt[] = [];
    const licenses: LicenseExt[] = [];
    for (const it of assets?.items ?? []) {
      if (it.type === "Airport") airports.push(mapAirport(it, flights));
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

    // Visitor history: other pilots flying through my hubs. The airport leg
    // (origin.earnedPax / destination.earnedPax) is real PAX paid to me even
    // though the visiting pilot keeps 60% of the gross. Page through every
    // owned airport, then fold into the daily timeseries + activity feed.
    const VISITOR_PAGES = 10;
    const visitorPerAirport = await Promise.all(
      airports.map(async (ap) => {
        const urls = Array.from({ length: VISITOR_PAGES }, (_, i) =>
          `${SIMFLY_BASE}/user/assets/airport/${encodeURIComponent(ap.icao)}/flights?username=${encodeURIComponent(username)}&nonce=${nonce}&page=${i + 1}`,
        );
        const pages = await Promise.all(urls.map((u) => fetchJSON<RawAirportHistPage>(u)));
        const items: VisitorFlightWithHub[] = [];
        for (const r of pages) {
          if (!r) continue;
          for (const f of r.flights ?? []) {
            const n = normaliseHistFlight(f, ap.icao, username);
            if (n && !n.isOwner) items.push({ ...n, airportIcao: ap.icao });
          }
        }
        return items;
      }),
    );
    // Aircraft rental history: other pilots flying MY aircraft between
    // airports I may not own. SimFly exposes
    //   /api/user/assets/airplane/{aircraftId}/flights?page=N  (5/page)
    // and reports my cut as airplane.totalEarnedPax on each entry.
    const AIRCRAFT_PAGES = 6;
    const aircraftPerPlane = await Promise.all(
      airplanes.map(async (ap) => {
        const urls = Array.from({ length: AIRCRAFT_PAGES }, (_, i) =>
          `${SIMFLY_BASE}/user/assets/airplane/${encodeURIComponent(ap.aircraftId)}/flights?username=${encodeURIComponent(username)}&nonce=${nonce}&page=${i + 1}`,
        );
        const pages = await Promise.all(
          urls.map((u) => fetchJSON<{ flights?: RawAirportHistFlight[] }>(u)),
        );
        const items: VisitorFlightWithHub[] = [];
        for (const r of pages) {
          if (!r) continue;
          for (const f of r.flights ?? []) {
            const visitor = f.pilot?.username ?? "";
            if (!visitor || visitor.toLowerCase() === username.toLowerCase()) continue;
            const paxAircraft =
              f.airplane?.totalEarnedPax ?? f.airplane?.earnedPax ?? 0;
            if (!paxAircraft) continue;
            const origin = f.origin?.icao ?? "";
            const destination = f.destination?.icao ?? "";
            items.push({
              id: f.flightID,
              ts: f.departureTime ?? f.takeoffTime ?? f.landingTime ?? "",
              visitor,
              isOwner: false,
              role: "takeoff",
              otherIcao: destination,
              paxVisitor: f.pax ?? 0,
              paxAirport: 0,
              paxAircraft,
              aircraft: f.airplane?.name ?? ap.name,
              airportIcao: origin || ap.currentIcao || ap.icao,
            });
          }
        }
        return items;
      }),
    );

    const uniqueVisitorFlights = mergeVisitorFlights(
      visitorPerAirport.flat(),
      aircraftPerPlane.flat(),
    );

    // Fold visitor PAX (airport leg + aircraft rental) into daily timeseries.
    const visitorByDay = visitorPaxByDay(uniqueVisitorFlights);
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
    const flightActivity: ActivityEntry[] = flights.slice(0, 200).map((f) => ({
      id: f.id,
      kind: f.licence ? ("license" as const) : ("route" as const),
      actorHandle: me.handle,
      message: `${f.departure_icao} → ${f.destination_icao} · ${f.aircraft}${f.licence ? ` · license ${f.licence}` : ""} · ${Math.round(f.total_distance)} nm`,
      delta: f.pax,
      at: f.mission_start_ts,
    }));

    // Visitor flights as activity, marked clearly.
    const visitorActivity: ActivityEntry[] = uniqueVisitorFlights.map((v) => ({
      id: `visitor-${v.id}`,
      kind: "route" as const,
      actorHandle: v.visitor,
      hubIcao: v.airportIcao,
      message: `(Visitor) @${v.visitor} · ${v.role === "takeoff" ? `${v.airportIcao} → ${v.otherIcao}` : `${v.otherIcao} → ${v.airportIcao}`} · ${v.aircraft}${v.paxAircraft ? " · my aircraft" : ""}`,
      delta: Math.round(((v.paxAirport || 0) + (v.paxAircraft || 0)) * 100) / 100,
      at: v.ts,
    }));


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
        .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
        .slice(0, 250),

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
    try {
      const res = await fetch(
        `${SIMFLY_BASE}/user/v2/?nonce=${nonce}&username=${encodeURIComponent(username)}`,
        { headers: { Accept: "application/json" } },
      );
      if (res.ok) {
        return {
          status: "ok",
          httpStatus: res.status,
          message: `Live SimFly data for @${username}`,
          checkedAt,
          username,
        };
      }
      if (res.status === 404) {
        return {
          status: "missing",
          httpStatus: 404,
          message: `SimFly user @${username} (nonce ${nonce}) not found. Set SIMFLY_USERNAME / SIMFLY_NONCE.`,
          checkedAt,
          username,
        };
      }
      return {
        status: "error",
        httpStatus: res.status,
        message: `SimFly returned HTTP ${res.status}.`,
        checkedAt,
        username,
      };
    } catch (err) {
      return {
        status: "error",
        message: `Could not reach SimFly: ${err instanceof Error ? err.message : "unknown"}.`,
        checkedAt,
        username,
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
  .inputValidator((d: { kind: "airport" | "airplane"; key: string }) => d)
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
  .inputValidator((d: { icaos: string[]; username?: string }) => d)
  .handler(async ({ data }): Promise<MyLiveFlight[]> => {
    const { username } = identity({ username: data.username });
    const icaos = (data.icaos ?? []).filter(Boolean).slice(0, 24);
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
    for (const { icao, list } of results) {
      for (const f of list) {
        if (f.username?.toLowerCase() !== me) continue;
        if (seen.has(f.id)) continue;
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
    const results = await Promise.all(
      icaos.map(async (icao) => {
        const res = await fetchJSON<{ data: RawLiveFlight[] }>(
          `${SIMFLY_BASE}/asset/airport/${encodeURIComponent(icao)}/flights`,
        );
        const list = (res?.data ?? [])
          .filter((f) => f.username?.toLowerCase() !== me)
          .filter((f) => f.destinationICAO === icao || f.originICAO === icao)
          .map<AirportLiveVisitor>((f) => ({
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
  pilot?: { username?: string };
  airplane?: { name?: string; owner?: { username?: string }; earnedPax?: number; totalEarnedPax?: number };
  origin?: { icao?: string; earnedPax?: number; totalEarnedPax?: number };
  destination?: { icao?: string; earnedPax?: number; totalEarnedPax?: number };
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
      `${SIMFLY_BASE}/user/assets/airport/${encodeURIComponent(data.icao)}/flights?username=${encodeURIComponent(username)}&nonce=${nonce}&page=${i + 1}`,
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
      `${SIMFLY_BASE}/user/assets/all?username=${encodeURIComponent(username)}&nonce=${nonce}`,
    );
    const icaos = (assets?.items ?? [])
      .filter((it): it is RawAssetAirport => it.type === "Airport")
      .map((it) => it.icao);

    // Page through every airport in parallel.
    const perAirport = await Promise.all(
      icaos.map(async (icao) => {
        const urls = Array.from({ length: pagesPerAirport }, (_, i) =>
          `${SIMFLY_BASE}/user/assets/airport/${encodeURIComponent(icao)}/flights?username=${encodeURIComponent(username)}&nonce=${nonce}&page=${i + 1}`,
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

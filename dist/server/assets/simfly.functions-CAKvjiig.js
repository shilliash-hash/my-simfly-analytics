import { T as TSS_SERVER_FUNCTION, c as createServerFn } from "./server-BfI8uGY9.js";
import "node:async_hooks";
import "h3-v2";
import "@tanstack/router-core";
import "seroval";
import "@tanstack/history";
import "@tanstack/router-core/ssr/client";
import "@tanstack/router-core/ssr/server";
import "react";
import "@tanstack/react-router";
import "react/jsx-runtime";
import "@tanstack/react-router/ssr/server";
var createServerRpc = (serverFnMeta, splitImportFn) => {
  const url = "/_serverFn/" + serverFnMeta.id;
  return Object.assign(splitImportFn, {
    url,
    serverFnMeta,
    [TSS_SERVER_FUNCTION]: true
  });
};
const tierFor$1 = (level) => level >= 40 ? "platinum" : level >= 25 ? "gold" : level >= 12 ? "silver" : "bronze";
const ME = {
  handle: "skycaptain",
  displayName: "Sky Captain",
  level: 32,
  xp: 184500,
  paxTokens: 1284320,
  avatarHue: 190,
  joinedAt: "2024-03-12T00:00:00Z",
  country: "US"
};
const COMMUNITY = [
  ME,
  { handle: "nordwind", displayName: "Nordwind", level: 47, xp: 412900, paxTokens: 318e4, avatarHue: 220, joinedAt: "2023-08-01T00:00:00Z", country: "DE" },
  { handle: "tokyo_jet", displayName: "Tokyo Jet", level: 41, xp: 298400, paxTokens: 2410500, avatarHue: 350, joinedAt: "2023-11-04T00:00:00Z", country: "JP" },
  { handle: "rio_runway", displayName: "Rio Runway", level: 28, xp: 152300, paxTokens: 980220, avatarHue: 50, joinedAt: "2024-01-20T00:00:00Z", country: "BR" },
  { handle: "outback_air", displayName: "Outback Air", level: 35, xp: 221700, paxTokens: 1640800, avatarHue: 30, joinedAt: "2023-10-15T00:00:00Z", country: "AU" },
  { handle: "heathrow_hq", displayName: "Heathrow HQ", level: 38, xp: 268200, paxTokens: 1990400, avatarHue: 270, joinedAt: "2023-09-09T00:00:00Z", country: "GB" },
  { handle: "alpine_ops", displayName: "Alpine Ops", level: 22, xp: 98400, paxTokens: 612e3, avatarHue: 150, joinedAt: "2024-05-02T00:00:00Z", country: "FR" },
  { handle: "savanna_wing", displayName: "Savanna Wing", level: 19, xp: 71200, paxTokens: 488900, avatarHue: 90, joinedAt: "2024-06-18T00:00:00Z", country: "ZA" },
  { handle: "gulf_pilot", displayName: "Gulf Pilot", level: 44, xp: 351600, paxTokens: 278e4, avatarHue: 200, joinedAt: "2023-07-22T00:00:00Z", country: "AE" },
  { handle: "monsoon_air", displayName: "Monsoon Air", level: 16, xp: 54200, paxTokens: 340100, avatarHue: 120, joinedAt: "2024-07-11T00:00:00Z", country: "IN" }
];
const HUB_SEEDS = [
  { id: "h1", icao: "KJFK", name: "John F. Kennedy Intl", city: "New York", country: "US", level: 38, xp: 268400, dailyPax: 41200, dailyEarnings: 18400, passengerFlow: 1236e3, upgrades: 14, lastUpgradeAt: "2026-06-10T11:20:00Z", lat: 40.64, lon: -73.78, ownerHandle: "skycaptain" },
  { id: "h2", icao: "EDDF", name: "Frankfurt Main", city: "Frankfurt", country: "DE", level: 47, xp: 412900, dailyPax: 58900, dailyEarnings: 26200, passengerFlow: 1767e3, upgrades: 19, lastUpgradeAt: "2026-06-12T08:05:00Z", lat: 50.03, lon: 8.56, ownerHandle: "nordwind" },
  { id: "h3", icao: "RJTT", name: "Tokyo Haneda", city: "Tokyo", country: "JP", level: 41, xp: 298400, dailyPax: 49300, dailyEarnings: 21800, passengerFlow: 1479e3, upgrades: 16, lastUpgradeAt: "2026-06-11T22:40:00Z", lat: 35.55, lon: 139.78, ownerHandle: "tokyo_jet" },
  { id: "h4", icao: "SBGR", name: "São Paulo Guarulhos", city: "São Paulo", country: "BR", level: 28, xp: 152300, dailyPax: 28400, dailyEarnings: 12100, passengerFlow: 852e3, upgrades: 9, lastUpgradeAt: "2026-06-09T14:15:00Z", lat: -23.43, lon: -46.47, ownerHandle: "rio_runway" },
  { id: "h5", icao: "YSSY", name: "Sydney Kingsford Smith", city: "Sydney", country: "AU", level: 35, xp: 221700, dailyPax: 36500, dailyEarnings: 15900, passengerFlow: 1095e3, upgrades: 12, lastUpgradeAt: "2026-06-08T03:50:00Z", lat: -33.94, lon: 151.18, ownerHandle: "outback_air" },
  { id: "h6", icao: "EGLL", name: "London Heathrow", city: "London", country: "GB", level: 38, xp: 268200, dailyPax: 44100, dailyEarnings: 19700, passengerFlow: 1323e3, upgrades: 13, lastUpgradeAt: "2026-06-13T09:30:00Z", lat: 51.47, lon: -0.45, ownerHandle: "heathrow_hq" },
  { id: "h7", icao: "LFPG", name: "Paris Charles de Gaulle", city: "Paris", country: "FR", level: 22, xp: 98400, dailyPax: 19800, dailyEarnings: 8400, passengerFlow: 594e3, upgrades: 7, lastUpgradeAt: "2026-06-07T17:00:00Z", lat: 49.01, lon: 2.55, ownerHandle: "alpine_ops" },
  { id: "h8", icao: "FAOR", name: "Johannesburg OR Tambo", city: "Johannesburg", country: "ZA", level: 19, xp: 71200, dailyPax: 16200, dailyEarnings: 6900, passengerFlow: 486e3, upgrades: 6, lastUpgradeAt: "2026-06-06T12:25:00Z", lat: -26.13, lon: 28.24, ownerHandle: "savanna_wing" },
  { id: "h9", icao: "OMDB", name: "Dubai International", city: "Dubai", country: "AE", level: 44, xp: 351600, dailyPax: 53800, dailyEarnings: 24100, passengerFlow: 1614e3, upgrades: 17, lastUpgradeAt: "2026-06-13T20:10:00Z", lat: 25.25, lon: 55.36, ownerHandle: "gulf_pilot" },
  { id: "h10", icao: "VIDP", name: "Indira Gandhi Intl", city: "Delhi", country: "IN", level: 16, xp: 54200, dailyPax: 13400, dailyEarnings: 5400, passengerFlow: 402e3, upgrades: 5, lastUpgradeAt: "2026-06-05T07:45:00Z", lat: 28.56, lon: 77.1, ownerHandle: "monsoon_air" },
  { id: "h11", icao: "KLAX", name: "Los Angeles Intl", city: "Los Angeles", country: "US", level: 31, xp: 178900, dailyPax: 32700, dailyEarnings: 14200, passengerFlow: 981e3, upgrades: 11, lastUpgradeAt: "2026-06-12T19:55:00Z", lat: 33.94, lon: -118.4, ownerHandle: "skycaptain" },
  { id: "h12", icao: "ZBAA", name: "Beijing Capital", city: "Beijing", country: "CN", level: 26, xp: 134600, dailyPax: 24800, dailyEarnings: 10900, passengerFlow: 744e3, upgrades: 8, lastUpgradeAt: "2026-06-11T05:30:00Z", lat: 40.08, lon: 116.58, ownerHandle: "skycaptain" }
];
const HUBS = HUB_SEEDS.map((h) => ({
  ...h,
  ownerHandle: h.ownerHandle ?? "skycaptain",
  tier: tierFor$1(h.level)
}));
const AC_TYPES = [
  "Boeing 737-800",
  "Boeing 777-300ER",
  "Boeing 787-9",
  "Airbus A320neo",
  "Airbus A350-900",
  "Airbus A220-300",
  "Embraer E195-E2",
  "Bombardier CRJ-900",
  "ATR 72-600"
];
const AIRCRAFT = Array.from({ length: 25 }).map((_, i) => {
  const hub = HUBS[i % HUBS.length];
  const status = i % 11 === 0 ? "maintenance" : i % 13 === 0 ? "grounded" : i % 5 === 0 ? "transit" : "active";
  return {
    id: `a${i + 1}`,
    registration: `N${100 + i}SF`,
    type: AC_TYPES[i % AC_TYPES.length],
    status,
    locationIcao: hub.icao,
    ownerHandle: hub.ownerHandle,
    xpGenerated: 4e3 + i * 911 % 18e3,
    flightsToday: status === "active" ? 2 + i % 4 : 0,
    paxToday: status === "active" ? 220 + i * 73 % 480 : 0
  };
});
const ACTIVITY_KINDS = ["upgrade", "purchase", "levelup", "route", "license"];
const ACTIVITY_TEMPLATES = {
  upgrade: (h) => `Upgraded ${h.icao} terminal to L${h.level}`,
  purchase: (h) => `Acquired new gate cluster at ${h.icao}`,
  levelup: (_, p) => `${p.displayName} reached level ${p.level}`,
  route: (h) => `Opened new route from ${h.icao}`,
  license: (h, p) => `License used · ${h.icao} departure · +${Math.floor(Math.random() * 400) + 120} PAX`
};
const ACTIVITY = Array.from({ length: 50 }).map((_, i) => {
  const kind = ACTIVITY_KINDS[i % ACTIVITY_KINDS.length];
  const hub = HUBS[i % HUBS.length];
  const player = COMMUNITY[i % COMMUNITY.length];
  const hoursAgo = i * 3 + i % 5;
  const at = new Date(Date.UTC(2026, 5, 14, 9, 0, 0) - hoursAgo * 36e5).toISOString();
  return {
    id: `e${i + 1}`,
    kind,
    actorHandle: player.handle,
    hubIcao: kind === "levelup" ? void 0 : hub.icao,
    message: ACTIVITY_TEMPLATES[kind](hub, player),
    delta: kind === "levelup" ? 1 : 200 + i * 137 % 1200,
    at
  };
});
const EARNINGS = Array.from({ length: 30 }).map((_, i) => {
  const date = new Date(Date.UTC(2026, 4, 16) + i * 864e5).toISOString().slice(0, 10);
  const base = 38e3 + Math.round(Math.sin(i / 4) * 6500) + i * 420;
  return {
    date,
    pax: base + i * 311 % 4e3,
    xp: Math.round(base * 0.42) + i * 97 % 1800
  };
});
const XP_BY_ASSET = [
  ...HUBS.slice(0, 4).map((h) => ({ label: h.icao, xp: h.xp, kind: "hub" })),
  { label: "N100SF · 737-800", xp: 22400, kind: "aircraft" },
  { label: "N104SF · A350-900", xp: 19800, kind: "aircraft" },
  { label: "JFK ↔ LHR", xp: 17200, kind: "route" },
  { label: "DXB ↔ HND", xp: 14900, kind: "route" }
];
const MOCK_PAYLOAD = {
  me: ME,
  paxTokens: ME.paxTokens,
  level: ME.level,
  xp: ME.xp,
  availablePax: 0,
  lifetimePax: ME.paxTokens,
  paxLast7d: 0,
  paxLast30d: 0,
  aircraft: AIRCRAFT,
  hubs: HUBS,
  activity: ACTIVITY,
  earningsTimeseries: EARNINGS,
  xpByAsset: XP_BY_ASSET,
  paxByAsset: [],
  airports: [],
  airplanes: [],
  licenses: [],
  flights: [],
  visitors: [],
  community: COMMUNITY
};
const SIMFLY_BASE = "https://simfly.io/api";
const DEFAULT_USERNAME = "shill";
const DEFAULT_NONCE = "1697880083";
const FETCH_TIMEOUT_MS = 12e3;
function defaultUsername() {
  return process.env.SIMFLY_USERNAME || DEFAULT_USERNAME;
}
function defaultNonce() {
  return process.env.SIMFLY_NONCE || DEFAULT_NONCE;
}
const nonceCache = /* @__PURE__ */ new Map();
function rememberNonce(username, nonce) {
  if (!username || typeof nonce !== "number" || !Number.isFinite(nonce)) return;
  const key = username.toLowerCase();
  if (!nonceCache.has(key)) nonceCache.set(key, nonce);
}
async function resolveNonce(username) {
  const key = username.toLowerCase();
  if (key === defaultUsername().toLowerCase()) return Number(defaultNonce()) || null;
  const cached = nonceCache.get(key);
  if (cached) return cached;
  const live = await fetchJSON(`${SIMFLY_BASE}/live/flights`);
  for (const d of live?.data ?? []) rememberNonce(d.username, d.usernonce);
  let hit = nonceCache.get(key);
  if (hit) return hit;
  const me = defaultUsername();
  const myNonce = defaultNonce();
  const assets = await fetchJSON(`${SIMFLY_BASE}/user/assets/all?username=${encodeURIComponent(me)}&nonce=${myNonce}`);
  const anchor = (assets?.items ?? []).find((it) => it.type === "Airport");
  if (anchor) {
    for (let page = 1; page <= 6 && !nonceCache.has(key); page += 1) {
      const r = await fetchJSON(`${SIMFLY_BASE}/user/assets/airport/${encodeURIComponent(anchor.icao)}/flights?username=${encodeURIComponent(me)}&nonce=${myNonce}&page=${page}`);
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
async function resolveIdentity(input) {
  const username = (input?.username || defaultUsername()).trim();
  if (input?.nonce) return {
    username,
    nonce: input.nonce
  };
  if (username.toLowerCase() === defaultUsername().toLowerCase()) {
    return {
      username,
      nonce: defaultNonce()
    };
  }
  const n = await resolveNonce(username);
  return {
    username,
    nonce: n ? String(n) : defaultNonce()
  };
}
function identity(input) {
  const username = input?.username || defaultUsername();
  const cached = nonceCache.get(username.toLowerCase());
  return {
    username,
    nonce: input?.nonce || (cached ? String(cached) : defaultNonce())
  };
}
async function fetchJSON(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json"
      },
      signal: controller.signal
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
async function fetchText(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json"
      },
      signal: controller.signal
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
const TIER_BY_CATEGORY = {
  6: {
    tier: "T6",
    label: "Mega Hub"
  },
  5: {
    tier: "T5",
    label: "Major"
  },
  4: {
    tier: "T4",
    label: "Large"
  },
  3: {
    tier: "T3",
    label: "Medium"
  },
  2: {
    tier: "T2",
    label: "Regional"
  },
  1: {
    tier: "T1",
    label: "Airstrip"
  }
};
function tierFor(category) {
  return TIER_BY_CATEGORY[category] ?? {
    tier: "T1",
    label: `C${category}`
  };
}
const legacyTierForLevel = (level) => level >= 10 ? "platinum" : level >= 5 ? "gold" : level >= 3 ? "silver" : "bronze";
function mapAirport(a, flights) {
  const now = Date.now();
  const wkAgo = now - 7 * 864e5;
  const moAgo = now - 30 * 864e5;
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
  const {
    tier,
    label
  } = tierFor(a.category);
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
    flights7d
  };
}
function mapAirplane(a, flights) {
  const now = Date.now();
  const wkAgo = now - 7 * 864e5;
  const moAgo = now - 30 * 864e5;
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
    pax30d
  };
}
function mapLicence(a, flights) {
  const now = Date.now();
  const wkAgo = now - 7 * 864e5;
  const moAgo = now - 30 * 864e5;
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
    timers: (a.timers ?? []).filter((t) => t.kind === "TIMER24" || t.kind === "TIMER84").map((t) => ({
      kind: t.kind,
      minutesAvailable: t.minutesAvailable ?? 0,
      minutesCap: t.minutesReinstated ?? 0,
      nextRestoreTs: t.nextRestoreTimestamp ?? 0,
      minsUntilNextRestore: t.minsUntilNextRestore ?? 0
    }))
  };
}
function airportToHub(a, owner) {
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
    lastUpgradeAt: (/* @__PURE__ */ new Date()).toISOString(),
    lat: 0,
    lon: 0
  };
}
function airplaneToAircraft(p, owner) {
  return {
    id: p.aircraftId,
    registration: p.tailNumber || p.icao,
    type: p.name,
    status: p.inGroundOperation ? "maintenance" : "active",
    locationIcao: p.currentIcao,
    ownerHandle: owner,
    xpGenerated: p.totalEarnedXp,
    flightsToday: 0,
    paxToday: Math.round(p.totalEarnedPax)
  };
}
function flightsToTimeseries(flights) {
  const map = /* @__PURE__ */ new Map();
  for (const f of flights) {
    const day = (f.mission_start_ts || "").slice(0, 10);
    if (!day) continue;
    const cur = map.get(day) ?? {
      date: day,
      pax: 0,
      paxKept: 0,
      paxDonated: 0,
      xp: 0
    };
    const kept = f.pax || 0;
    cur.pax += kept;
    cur.paxKept = (cur.paxKept ?? 0) + kept;
    cur.xp += f.xp || 0;
    map.set(day, cur);
  }
  const today = /* @__PURE__ */ new Date();
  const out = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    const pt = map.get(key) ?? {
      date: key,
      pax: 0,
      paxKept: 0,
      paxDonated: 0,
      xp: 0
    };
    pt.paxKept = Math.round((pt.paxKept ?? 0) * 100) / 100;
    pt.paxDonated = 0;
    pt.pax = Math.round(pt.pax * 100) / 100;
    out.push(pt);
  }
  return out;
}
function flightsToLog(flights) {
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
    licenceRank: f.licence_rank ?? 0
  }));
}
const getSimflyPayload_createServerFn_handler = createServerRpc({
  id: "501e232c547b1d985a67c3d575b0c773580e141936c74618be4bb706397244e8",
  name: "getSimflyPayload",
  filename: "src/lib/simfly.functions.ts"
}, (opts) => getSimflyPayload.__executeServer(opts));
const getSimflyPayload = createServerFn({
  method: "GET"
}).inputValidator((d) => d ?? {}).handler(getSimflyPayload_createServerFn_handler, async ({
  data
}) => {
  const {
    username,
    nonce
  } = await resolveIdentity(data);
  const qs = `username=${encodeURIComponent(username)}&nonce=${nonce}`;
  const [profile, stats, assets, availablePaxRaw, p1, p2, p3] = await Promise.all([fetchJSON(`${SIMFLY_BASE}/user/v2/?nonce=${nonce}&username=${encodeURIComponent(username)}`), fetchJSON(`${SIMFLY_BASE}/user/stats?${qs}`), fetchJSON(`${SIMFLY_BASE}/user/assets/all?${qs}`), fetchText(`${SIMFLY_BASE}/user/pax?${qs}`), fetchJSON(`${SIMFLY_BASE}/user/flights?${qs}&page=1`), fetchJSON(`${SIMFLY_BASE}/user/flights?${qs}&page=2`), fetchJSON(`${SIMFLY_BASE}/user/flights?${qs}&page=3`)]);
  if (!profile) {
    return {
      ...MOCK_PAYLOAD,
      _source: "mock",
      _stale: true
    };
  }
  const flights = Array.from(new Map([...p1?.flights ?? [], ...p2?.flights ?? [], ...p3?.flights ?? []].map((flight) => [flight.id, flight])).values());
  const airports = [];
  const airplanes = [];
  const licenses = [];
  for (const it of assets?.items ?? []) {
    if (it.type === "Airport") airports.push(mapAirport(it, flights));
    else if (it.type === "Airplane") airplanes.push(mapAirplane(it, flights));
    else if (it.type === "Pilot License") licenses.push(mapLicence(it, flights));
  }
  const pilotLevel = Math.max(0, ...licenses.map((l) => l.level));
  const availablePax = availablePaxRaw ? Number(availablePaxRaw) || 0 : 0;
  const lifetimePax = Math.round(stats?.rewards.totalPAXReceived ?? stats?.rewards.pax ?? 0);
  const now = Date.now();
  const wk = now - 7 * 864e5;
  const mo = now - 30 * 864e5;
  let paxLast7d = 0;
  let paxLast30d = 0;
  for (const f of flights) {
    const ts = new Date(f.mission_start_ts).getTime();
    if (!Number.isFinite(ts)) continue;
    if (ts >= mo) paxLast30d += f.pax || 0;
    if (ts >= wk) paxLast7d += f.pax || 0;
  }
  const avatarUrl = profile.avatar ? `https://simfly.io/${profile.avatar.replace(/^(\.\.\/)+/, "")}` : void 0;
  const me = {
    handle: profile.username,
    displayName: profile.username,
    level: pilotLevel || 1,
    xp: Math.round(stats?.rewards.xp ?? 0),
    paxTokens: Math.round(availablePax),
    avatarHue: 190,
    avatarUrl,
    joinedAt: profile.registeredDate ? (/* @__PURE__ */ new Date(profile.registeredDate.replace(" ", "T") + "Z")).toISOString() : (/* @__PURE__ */ new Date()).toISOString(),
    country: profile.country ?? ""
  };
  const hubs = airports.map((a) => airportToHub(a, me.handle));
  const aircraft = airplanes.map((p) => airplaneToAircraft(p, me.handle));
  const earningsTimeseries = flightsToTimeseries(flights);
  const VISITOR_PAGES = 10;
  const visitorPerAirport = await Promise.all(airports.map(async (ap) => {
    const urls = Array.from({
      length: VISITOR_PAGES
    }, (_, i) => `${SIMFLY_BASE}/user/assets/airport/${encodeURIComponent(ap.icao)}/flights?username=${encodeURIComponent(username)}&nonce=${nonce}&page=${i + 1}`);
    const pages = await Promise.all(urls.map((u) => fetchJSON(u)));
    const items = [];
    for (const r of pages) {
      if (!r) continue;
      for (const f of r.flights ?? []) {
        const n = normaliseHistFlight(f, ap.icao, username);
        if (n && !n.isOwner) items.push({
          ...n,
          airportIcao: ap.icao
        });
      }
    }
    return items;
  }));
  const visitorFlights = visitorPerAirport.flat();
  const byVisitorFlight = /* @__PURE__ */ new Map();
  for (const v of visitorFlights) {
    const prev = byVisitorFlight.get(v.id);
    if (!prev) byVisitorFlight.set(v.id, v);
    else byVisitorFlight.set(v.id, {
      ...prev,
      paxAirport: prev.paxAirport + v.paxAirport,
      // paxAircraft is per-flight, not per-hub — take max so we don't double-count.
      paxAircraft: Math.max(prev.paxAircraft ?? 0, v.paxAircraft ?? 0)
    });
  }
  const uniqueVisitorFlights = Array.from(byVisitorFlight.values());
  const visitorByDay = /* @__PURE__ */ new Map();
  for (const v of uniqueVisitorFlights) {
    const day = (v.ts || "").slice(0, 10);
    if (!day) continue;
    const total = (v.paxAirport || 0) + (v.paxAircraft || 0);
    visitorByDay.set(day, (visitorByDay.get(day) ?? 0) + total);
  }
  for (const pt of earningsTimeseries) {
    pt.paxVisitors = Math.round((visitorByDay.get(pt.date) ?? 0) * 100) / 100;
  }
  const xpByAsset = [...airports.slice(0, 6).map((a) => ({
    label: a.icao,
    xp: a.totalEarnedXp,
    kind: "hub"
  })), ...airplanes.slice(0, 6).map((p) => ({
    label: p.tailNumber || p.icao,
    xp: p.totalEarnedXp,
    kind: "aircraft"
  }))].sort((a, b) => b.xp - a.xp);
  const paxByAsset = [...airports.map((a) => ({
    label: a.icao,
    pax: Math.round(a.totalEarnedPax),
    kind: "hub"
  })), ...airplanes.map((p) => ({
    label: p.tailNumber || p.icao,
    pax: Math.round(p.totalEarnedPax),
    kind: "aircraft"
  })), ...licenses.map((l) => ({
    label: l.code || l.name,
    pax: Math.round(l.totalEarnedPax),
    kind: "licence"
  }))].filter((r) => r.pax > 0).sort((a, b) => b.pax - a.pax).slice(0, 16);
  const flightLog = flightsToLog(flights);
  const flightActivity = flights.slice(0, 200).map((f) => ({
    id: f.id,
    kind: f.licence ? "license" : "route",
    actorHandle: me.handle,
    message: `${f.departure_icao} → ${f.destination_icao} · ${f.aircraft}${f.licence ? ` · license ${f.licence}` : ""} · ${Math.round(f.total_distance)} nm`,
    delta: f.pax,
    at: f.mission_start_ts
  }));
  const visitorActivity = uniqueVisitorFlights.map((v) => ({
    id: `visitor-${v.id}`,
    kind: "route",
    actorHandle: v.visitor,
    hubIcao: v.airportIcao,
    message: `(Visitor) @${v.visitor} · ${v.role === "takeoff" ? `${v.airportIcao} → ${v.otherIcao}` : `${v.otherIcao} → ${v.airportIcao}`} · ${v.aircraft}${v.paxAircraft ? " · my aircraft" : ""}`,
    delta: Math.round(((v.paxAirport || 0) + (v.paxAircraft || 0)) * 100) / 100,
    at: v.ts
  }));
  const visitors = [];
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
    activity: [...flightActivity, ...visitorActivity].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 250),
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
    _fetchedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
});
const checkSimflySession_createServerFn_handler = createServerRpc({
  id: "6b4522a33897c9bfc91b2458441f5a0520bb4ce7caeecbd13b64a021295f1a49",
  name: "checkSimflySession",
  filename: "src/lib/simfly.functions.ts"
}, (opts) => checkSimflySession.__executeServer(opts));
const checkSimflySession = createServerFn({
  method: "GET"
}).handler(checkSimflySession_createServerFn_handler, async () => {
  const checkedAt = (/* @__PURE__ */ new Date()).toISOString();
  const {
    username,
    nonce
  } = identity();
  try {
    const res = await fetch(`${SIMFLY_BASE}/user/v2/?nonce=${nonce}&username=${encodeURIComponent(username)}`, {
      headers: {
        Accept: "application/json"
      }
    });
    if (res.ok) {
      return {
        status: "ok",
        httpStatus: res.status,
        message: `Live SimFly data for @${username}`,
        checkedAt,
        username
      };
    }
    if (res.status === 404) {
      return {
        status: "missing",
        httpStatus: 404,
        message: `SimFly user @${username} (nonce ${nonce}) not found. Set SIMFLY_USERNAME / SIMFLY_NONCE.`,
        checkedAt,
        username
      };
    }
    return {
      status: "error",
      httpStatus: res.status,
      message: `SimFly returned HTTP ${res.status}.`,
      checkedAt,
      username
    };
  } catch (err) {
    return {
      status: "error",
      message: `Could not reach SimFly: ${err instanceof Error ? err.message : "unknown"}.`,
      checkedAt,
      username
    };
  }
});
const OPENFLIGHTS_URL = "https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.dat";
let GEO_CACHE = null;
let GEO_LOAD = null;
async function loadGeo() {
  if (GEO_CACHE) return GEO_CACHE;
  if (GEO_LOAD) return GEO_LOAD;
  GEO_LOAD = (async () => {
    const res = await fetch(OPENFLIGHTS_URL);
    const text = await res.text();
    const map = /* @__PURE__ */ new Map();
    for (const line of text.split("\n")) {
      const cols = [];
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
      map.set(icao.toUpperCase(), {
        icao,
        lat,
        lon,
        name
      });
    }
    GEO_CACHE = map;
    return map;
  })();
  return GEO_LOAD;
}
const getAirportGeo_createServerFn_handler = createServerRpc({
  id: "34d40221213585ffdf0f2e9d1c6fac47826ecc18e3e64f7b8d49a1bed0cdc203",
  name: "getAirportGeo",
  filename: "src/lib/simfly.functions.ts"
}, (opts) => getAirportGeo.__executeServer(opts));
const getAirportGeo = createServerFn({
  method: "GET"
}).inputValidator((d) => d).handler(getAirportGeo_createServerFn_handler, async ({
  data
}) => {
  const map = await loadGeo();
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const raw of data.icaos) {
    const k = (raw || "").toUpperCase();
    if (!k || seen.has(k)) continue;
    seen.add(k);
    const hit = map.get(k);
    if (hit) out.push(hit);
  }
  return out;
});
const getSimflyAssetDetail_createServerFn_handler = createServerRpc({
  id: "ebd8f907134e9fe8564d40ce21c363b13077534141500eb08a53dab5bc02d18e",
  name: "getSimflyAssetDetail",
  filename: "src/lib/simfly.functions.ts"
}, (opts) => getSimflyAssetDetail.__executeServer(opts));
const getSimflyAssetDetail = createServerFn({
  method: "GET"
}).inputValidator((d) => d).handler(getSimflyAssetDetail_createServerFn_handler, async ({
  data
}) => {
  const url = `${SIMFLY_BASE}/user/assets/details/${data.kind}/${encodeURIComponent(data.key)}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json"
    }
  });
  if (!res.ok) throw new Error(`SimFly asset ${data.kind}/${data.key} not found`);
  const text = await res.text();
  return {
    kind: data.kind,
    key: data.key,
    json: text
  };
});
const getAirportVisitors_createServerFn_handler = createServerRpc({
  id: "06b26a6968414996e6a1c2e2981ccbe5c7689374bff90302f907b543dca6c661",
  name: "getAirportVisitors",
  filename: "src/lib/simfly.functions.ts"
}, (opts) => getAirportVisitors.__executeServer(opts));
const getAirportVisitors = createServerFn({
  method: "GET"
}).inputValidator((d) => d).handler(getAirportVisitors_createServerFn_handler, async ({
  data
}) => {
  const {
    username
  } = identity({
    username: data.username
  });
  const res = await fetchJSON(`${SIMFLY_BASE}/asset/airport/${encodeURIComponent(data.icao)}/flights`);
  const list = res?.data ?? [];
  return list.filter((f) => f.username?.toLowerCase() !== username.toLowerCase()).filter((f) => f.originICAO === data.icao || f.destinationICAO === data.icao).map((f) => ({
    id: f.id,
    username: f.username,
    usernonce: f.usernonce,
    userAvatar: f.userAvatar,
    aircraftName: f.aircraftName,
    aircraftICAO: f.aircraftICAO,
    origin: f.originICAO,
    destination: f.destinationICAO,
    sim: f.simKind,
    tailNumber: f.tailNumber
  }));
});
const getMyLiveFlights_createServerFn_handler = createServerRpc({
  id: "8952a45b020f1c9e4c48e275854f114361d65c1419b223bdc56281b2fe20fe0e",
  name: "getMyLiveFlights",
  filename: "src/lib/simfly.functions.ts"
}, (opts) => getMyLiveFlights.__executeServer(opts));
const getMyLiveFlights = createServerFn({
  method: "GET"
}).inputValidator((d) => d).handler(getMyLiveFlights_createServerFn_handler, async ({
  data
}) => {
  const {
    username
  } = identity({
    username: data.username
  });
  const icaos = (data.icaos ?? []).filter(Boolean).slice(0, 24);
  const results = await Promise.all(icaos.map(async (icao) => {
    try {
      const res = await fetchJSON(`${SIMFLY_BASE}/asset/airport/${encodeURIComponent(icao)}/flights`);
      return {
        icao,
        list: res?.data ?? []
      };
    } catch {
      return {
        icao,
        list: []
      };
    }
  }));
  const seen = /* @__PURE__ */ new Map();
  const me = username.toLowerCase();
  for (const {
    icao,
    list
  } of results) {
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
        licenceCode: f.licence || void 0
      });
    }
  }
  return Array.from(seen.values());
});
const getMyHubsIncomingTraffic_createServerFn_handler = createServerRpc({
  id: "5bac8570b728e8b81fcc3f69db78853a6a9f3af8536abc48fe443f56ff50ad68",
  name: "getMyHubsIncomingTraffic",
  filename: "src/lib/simfly.functions.ts"
}, (opts) => getMyHubsIncomingTraffic.__executeServer(opts));
const getMyHubsIncomingTraffic = createServerFn({
  method: "GET"
}).inputValidator((d) => d).handler(getMyHubsIncomingTraffic_createServerFn_handler, async ({
  data
}) => {
  const {
    username
  } = identity({
    username: data.username
  });
  const me = username.toLowerCase();
  const icaos = (data.icaos ?? []).filter(Boolean).slice(0, 24);
  const results = await Promise.all(icaos.map(async (icao) => {
    const res = await fetchJSON(`${SIMFLY_BASE}/asset/airport/${encodeURIComponent(icao)}/flights`);
    const list = (res?.data ?? []).filter((f) => f.username?.toLowerCase() !== me).filter((f) => f.destinationICAO === icao || f.originICAO === icao).map((f) => ({
      id: f.id,
      username: f.username,
      usernonce: f.usernonce,
      userAvatar: f.userAvatar,
      aircraftName: f.aircraftName,
      aircraftICAO: f.aircraftICAO,
      origin: f.originICAO,
      destination: f.destinationICAO,
      sim: f.simKind,
      tailNumber: f.tailNumber
    }));
    const seen = /* @__PURE__ */ new Map();
    for (const v of list) if (!seen.has(v.id)) seen.set(v.id, v);
    return {
      icao,
      visitors: Array.from(seen.values())
    };
  }));
  return results.filter((r) => r.visitors.length > 0);
});
function normaliseHistFlight(raw, icao, me) {
  if (!raw.flightID) return null;
  const visitor = raw.pilot?.username ?? raw.airplane?.owner?.username ?? "";
  if (!visitor) return null;
  const ts = raw.departureTime ?? raw.takeoffTime ?? raw.landingTime ?? "";
  const origin = raw.origin?.icao ?? "";
  const destination = raw.destination?.icao ?? "";
  const role = origin === icao ? "takeoff" : "landing";
  const paxAirport = role === "takeoff" ? raw.origin?.totalEarnedPax ?? raw.origin?.earnedPax ?? 0 : raw.destination?.totalEarnedPax ?? raw.destination?.earnedPax ?? 0;
  const aircraftOwner = raw.airplane?.owner?.username ?? "";
  const aircraftIsMine = aircraftOwner.toLowerCase() === me.toLowerCase();
  const paxAircraft = aircraftIsMine ? raw.airplane?.totalEarnedPax ?? raw.airplane?.earnedPax ?? 0 : 0;
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
    aircraft: raw.airplane?.name ?? ""
  };
}
const getAirportFlightHistory_createServerFn_handler = createServerRpc({
  id: "08a312c4f29bc62186c4d2c1a8b15bf1e5cf081fbf126836328013b3715e730d",
  name: "getAirportFlightHistory",
  filename: "src/lib/simfly.functions.ts"
}, (opts) => getAirportFlightHistory.__executeServer(opts));
const getAirportFlightHistory = createServerFn({
  method: "GET"
}).inputValidator((d) => d).handler(getAirportFlightHistory_createServerFn_handler, async ({
  data
}) => {
  const {
    username,
    nonce
  } = await resolveIdentity({
    username: data.username
  });
  const pages = Math.min(Math.max(data.pages ?? 5, 1), 25);
  const urls = Array.from({
    length: pages
  }, (_, i) => `${SIMFLY_BASE}/user/assets/airport/${encodeURIComponent(data.icao)}/flights?username=${encodeURIComponent(username)}&nonce=${nonce}&page=${i + 1}`);
  const responses = await Promise.all(urls.map((u) => fetchJSON(u)));
  const items = [];
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
  return {
    icao: data.icao,
    items,
    totalLandings,
    totalTakeoffs,
    pagesFetched: pages
  };
});
const getVisitorHistory_createServerFn_handler = createServerRpc({
  id: "17954681f382b9977cd971834d9fd1698df755c0302b269b740ed8a7fb12860d",
  name: "getVisitorHistory",
  filename: "src/lib/simfly.functions.ts"
}, (opts) => getVisitorHistory.__executeServer(opts));
const getVisitorHistory = createServerFn({
  method: "GET"
}).inputValidator((d) => d ?? {}).handler(getVisitorHistory_createServerFn_handler, async ({
  data
}) => {
  const {
    username,
    nonce
  } = await resolveIdentity({
    username: data?.username
  });
  const pagesPerAirport = Math.min(Math.max(data?.pages ?? 5, 1), 25);
  const assets = await fetchJSON(`${SIMFLY_BASE}/user/assets/all?username=${encodeURIComponent(username)}&nonce=${nonce}`);
  const icaos = (assets?.items ?? []).filter((it) => it.type === "Airport").map((it) => it.icao);
  const perAirport = await Promise.all(icaos.map(async (icao) => {
    const urls = Array.from({
      length: pagesPerAirport
    }, (_, i) => `${SIMFLY_BASE}/user/assets/airport/${encodeURIComponent(icao)}/flights?username=${encodeURIComponent(username)}&nonce=${nonce}&page=${i + 1}`);
    const pages = await Promise.all(urls.map((u) => fetchJSON(u)));
    const items = [];
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
    return {
      icao,
      items,
      totalLandings,
      totalTakeoffs
    };
  }));
  const now = Date.now();
  const wk = now - 7 * 864e5;
  const mo = now - 30 * 864e5;
  const byVisitor = /* @__PURE__ */ new Map();
  for (const a of perAirport) {
    for (const f of a.items) {
      const tsMs = new Date(f.ts).getTime();
      const cur = byVisitor.get(f.visitor) ?? {
        handle: f.visitor,
        visits: 0,
        paxForMe: 0,
        paxForVisitor: 0,
        paxForMe7d: 0,
        paxForVisitor7d: 0,
        paxForMe30d: 0,
        paxForVisitor30d: 0,
        airports: [],
        lastSeenAt: f.ts,
        firstSeenAt: f.ts
      };
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
        row = {
          icao: a.icao,
          visits: 0,
          paxForMe: 0,
          paxForVisitor: 0
        };
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
      totalTakeoffs: a.totalTakeoffs
    })),
    pagesPerAirport,
    fetchedAt: (/* @__PURE__ */ new Date()).toISOString()
  };
});
export {
  checkSimflySession_createServerFn_handler,
  getAirportFlightHistory_createServerFn_handler,
  getAirportGeo_createServerFn_handler,
  getAirportVisitors_createServerFn_handler,
  getMyHubsIncomingTraffic_createServerFn_handler,
  getMyLiveFlights_createServerFn_handler,
  getSimflyAssetDetail_createServerFn_handler,
  getSimflyPayload_createServerFn_handler,
  getVisitorHistory_createServerFn_handler
};

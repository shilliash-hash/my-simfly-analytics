import { createServerFn } from "@tanstack/react-start";

// -----------------------------------------------------------------------------
// Alliance Intelligence — isolated premium relationship module.
// Only this file and src/routes/alliance.tsx form the module. No existing
// server helpers are imported; everything is self-contained by design so this
// expansion pack cannot break the production sync pipeline.
// -----------------------------------------------------------------------------

const SIMFLY_BASE = "https://simfly.io/api";
const DEFAULT_USERNAME = "shill";
const DEFAULT_NONCE = "1697880083";
const FETCH_TIMEOUT_MS = 12_000;
const MAX_PAGES_PER_AIRPORT = 40; // safety ceiling for the paginated walk
const AIRPORT_SCAN_CONCURRENCY = 4;
const CACHE_TTL_MS = 6 * 60 * 60_000; // 6 hours
const MAX_ALLIED_PILOTS_FOR_PORTFOLIO = 30;

function envUsername() {
  return process.env.SIMFLY_USERNAME || DEFAULT_USERNAME;
}
function envNonce() {
  return process.env.SIMFLY_NONCE || DEFAULT_NONCE;
}

async function fetchJSON<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
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
    clearTimeout(timeout);
  }
}

const TIER_BY_CATEGORY: Record<number, { tier: string; label: string }> = {
  1: { tier: "T1", label: "Airstrip" },
  2: { tier: "T2", label: "Regional" },
  3: { tier: "T3", label: "Medium" },
  4: { tier: "T4", label: "Large" },
  5: { tier: "T5", label: "Major" },
  6: { tier: "T6", label: "Mega" },
};

function tierFor(cat?: number) {
  return TIER_BY_CATEGORY[cat ?? 0] ?? { tier: "T1", label: `C${cat ?? 0}` };
}

// ---------- Types ----------

export type AllianceAirport = {
  icao: string;
  name: string;
  tier: string;
  tierLabel: string;
  level: number;
  weeklySlots: number;
  usedSlots: number;
  freeSlots: number;
};

export type AllianceCamp = "summit" | "camp3" | "camp2" | "camp1" | "base" | "trek";
export type AllianceReturnStatus = "completed" | "outstanding";

export type AllianceRecommendation = {
  code: "high_yield" | "free_slots" | "nearly_full" | "excellent" | "return_recommended" | "watch";
  icon: string;
  label: string;
  tone: "runway" | "instrument" | "gold" | "muted";
};

export type AlliancePilot = {
  username: string;
  nonce: number | null;
  avatarUrl?: string;
  visits: number;
  paxForMe: number;
  allianceFactor: number;
  lastVisitAt: string;
  returnStatus: AllianceReturnStatus;
  camp: AllianceCamp;
  airports: AllianceAirport[];
  totalFreeSlots: number;
  totalWeeklySlots: number;
  recommendation: AllianceRecommendation;
};

export type AllianceIntelPayload = {
  generatedAt: string;
  me: { username: string };
  totals: {
    pilots: number;
    totalAllianceFactor: number;
    outstandingReturns: number;
  };
  pilots: AlliancePilot[];
};

// ---------- Raw shapes ----------

type RawAirportSide = {
  icao?: string;
  totalEarnedPax?: number;
  earnedPax?: number;
  bonusPax?: number;
  sharedPax?: number | null;
  pax?: number;
};

type RawAirportHistFlight = {
  flightID?: string;
  departureTime?: string;
  takeoffTime?: string;
  landingTime?: string;
  pax?: number;
  pilot?: { username?: string; usernonce?: number; avatar?: string };
  airplane?: { owner?: { username?: string; nonce?: number } };
  origin?: RawAirportSide;
  destination?: RawAirportSide;
};

type RawAirportHistPage = {
  flights?: RawAirportHistFlight[];
};

type RawAssetsAll = {
  items?: Array<{
    type: string;
    icao?: string;
    name?: string;
    level?: number;
    category?: number;
    rotation?: number;
    maxRotation?: number;
  }>;
};

type RawProfile = { username?: string; avatar?: string };

// ---------- Aggregation helpers ----------

function airportSideCredit(side?: RawAirportSide): number {
  if (!side) return 0;
  const direct = side.totalEarnedPax ?? 0;
  if (direct > 0) return direct;
  const earned = side.earnedPax ?? side.pax ?? 0;
  const bonus = side.bonusPax ?? 0;
  const shared = side.sharedPax ?? 0;
  const withShared = earned + bonus + shared;
  if (withShared > 0) return withShared;
  return earned + bonus;
}

function assignCamp(rankIndex: number): AllianceCamp {
  if (rankIndex < 1) return "summit";
  if (rankIndex < 3) return "camp3";
  if (rankIndex < 6) return "camp2";
  if (rankIndex < 10) return "camp1";
  if (rankIndex < 16) return "base";
  return "trek";
}

function recommend(p: {
  allianceFactor: number;
  returnStatus: AllianceReturnStatus;
  bestTier: number;
  bestLevel: number;
  maxFreeSlots: number;
  totalWeeklySlots: number;
}): AllianceRecommendation {
  const slotPressure =
    p.totalWeeklySlots > 0 ? p.maxFreeSlots / p.totalWeeklySlots : 0;

  if (p.returnStatus === "outstanding" && p.allianceFactor > 50) {
    return {
      code: "high_yield",
      icon: "🔥",
      label: "High-Yield Return Route Available",
      tone: "instrument",
    };
  }
  if (p.returnStatus === "outstanding") {
    return {
      code: "return_recommended",
      icon: "✈",
      label: "Return Flight Recommended",
      tone: "instrument",
    };
  }
  if (p.maxFreeSlots === 0) {
    return {
      code: "nearly_full",
      icon: "⚠",
      label: "Airports Fully Booked This Cycle",
      tone: "muted",
    };
  }
  if (p.bestTier >= 5 && p.bestLevel >= 8 && p.allianceFactor > 100) {
    return {
      code: "excellent",
      icon: "🏆",
      label: "Excellent Alliance Partner",
      tone: "gold",
    };
  }
  if (slotPressure > 0.4) {
    return {
      code: "free_slots",
      icon: "🟢",
      label: "Plenty of Free Slots — Fly Now",
      tone: "runway",
    };
  }
  return {
    code: "watch",
    icon: "🛰",
    label: "Monitor — Slots Filling Up",
    tone: "muted",
  };
}

// ---------- Server fn ----------

export const getAllianceIntel = createServerFn({ method: "GET" })
  .inputValidator((d?: { username?: string; force?: boolean }) => d ?? {})
  .handler(async ({ data }): Promise<AllianceIntelPayload> => {
    const username = (data?.username || envUsername()).trim();
    const force = data?.force === true;
    const nonce = envNonce(); // for the viewer only; other pilots resolve via visits
    const qs = `username=${encodeURIComponent(username)}&nonce=${encodeURIComponent(nonce)}`;

    // Cache: reuse fresh aggregated payloads instead of hammering SimFly.
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    if (!force) {
      const { data: cached } = await supabaseAdmin
        .from("alliance_intel_cache" as never)
        .select("payload, refresh_after")
        .eq("username", username)
        .maybeSingle();
      const row = cached as
        | { payload: AllianceIntelPayload; refresh_after: string }
        | null;
      if (row && new Date(row.refresh_after).getTime() > Date.now()) {
        return row.payload;
      }
    }

    // Helper: keep stale cache as fallback if a refresh explodes.
    const readStale = async (): Promise<AllianceIntelPayload | null> => {
      const { data: cached } = await supabaseAdmin
        .from("alliance_intel_cache" as never)
        .select("payload")
        .eq("username", username)
        .maybeSingle();
      return (cached as { payload: AllianceIntelPayload } | null)?.payload ?? null;
    };

    try {
      // 1) My airports
      const myAssets = await fetchJSON<RawAssetsAll>(
        `${SIMFLY_BASE}/user/assets/all?${qs}`,
      );
      const myIcaos = (myAssets?.items ?? [])
        .filter((it) => it.type === "Airport" && typeof it.icao === "string")
        .map((it) => it.icao as string);

      if (myIcaos.length === 0) {
        const empty: AllianceIntelPayload = {
          generatedAt: new Date().toISOString(),
          me: { username },
          totals: { pilots: 0, totalAllianceFactor: 0, outstandingReturns: 0 },
          pilots: [],
        };
        return empty;
      }

      // 2) Visitor scan across every one of my airports — walk pages until
      //    SimFly returns an empty page or we hit the safety ceiling. Airport
      //    scans run with a small concurrency cap to avoid bursting SimFly.
      const perAirport: Array<{ icao: string; pages: (RawAirportHistPage | null)[] }> = [];
      for (let i = 0; i < myIcaos.length; i += AIRPORT_SCAN_CONCURRENCY) {
        const batch = myIcaos.slice(i, i + AIRPORT_SCAN_CONCURRENCY);
        const results = await Promise.all(
          batch.map(async (icao) => {
            const pages: (RawAirportHistPage | null)[] = [];
            for (let p = 1; p <= MAX_PAGES_PER_AIRPORT; p++) {
              const page = await fetchJSON<RawAirportHistPage>(
                `${SIMFLY_BASE}/user/assets/airport/${encodeURIComponent(icao)}/flights?${qs}&page=${p}`,
              );
              const flights = page?.flights ?? [];
              if (flights.length === 0) break;
              pages.push(page);
            }
            return { icao, pages };
          }),
        );
        perAirport.push(...results);
      }


    type Agg = {
      username: string;
      nonce: number | null;
      avatarUrl?: string;
      visits: number;
      paxForMe: number;
      lastVisitMs: number;
      lastVisitAt: string;
    };
    const byPilot = new Map<string, Agg>();

    for (const { icao, pages } of perAirport) {
      for (const page of pages) {
        for (const raw of page?.flights ?? []) {
          const pilot = raw.pilot?.username?.trim();
          if (!pilot) continue;
          if (pilot.toLowerCase() === username.toLowerCase()) continue; // skip self
          const ts = raw.landingTime ?? raw.takeoffTime ?? raw.departureTime ?? "";
          const tsMs = ts ? new Date(ts).getTime() : 0;
          const role: "takeoff" | "landing" =
            raw.destination?.icao === icao ? "landing" : "takeoff";
          if (role === "takeoff" && raw.origin?.icao !== icao) continue;
          const pax =
            role === "takeoff"
              ? airportSideCredit(raw.origin)
              : airportSideCredit(raw.destination);

          const cur =
            byPilot.get(pilot) ??
            ({
              username: pilot,
              nonce:
                typeof raw.pilot?.usernonce === "number"
                  ? raw.pilot.usernonce
                  : typeof raw.airplane?.owner?.nonce === "number"
                    ? raw.airplane!.owner!.nonce!
                    : null,
              avatarUrl: raw.pilot?.avatar
                ? `https://simfly.io/${raw.pilot.avatar.replace(/^(\.\.\/)+/, "")}`
                : undefined,
              visits: 0,
              paxForMe: 0,
              lastVisitMs: 0,
              lastVisitAt: ts,
            } satisfies Agg);
          cur.visits += 1;
          cur.paxForMe += pax;
          if (tsMs > cur.lastVisitMs) {
            cur.lastVisitMs = tsMs;
            cur.lastVisitAt = ts;
          }
          if (cur.nonce == null && typeof raw.pilot?.usernonce === "number") {
            cur.nonce = raw.pilot.usernonce;
          }
          byPilot.set(pilot, cur);
        }
      }
    }

    // Sort by Alliance Factor and keep top N for expensive portfolio lookup.
    const ranked = [...byPilot.values()]
      .map((a) => ({ ...a, allianceFactor: a.visits * a.paxForMe }))
      .sort((a, b) => b.allianceFactor - a.allianceFactor);

    const focus = ranked.slice(0, MAX_ALLIED_PILOTS_FOR_PORTFOLIO);

    // 3) My flight ICAO set — used for return detection. Read from the Hub's
    // own cached flights table so we don't hammer SimFly's paginated logbook.
    const myFlownIcaos = await (async () => {
      try {
        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        const { data: rows } = await supabaseAdmin
          .from("simfly_flights")
          .select("departure_icao,destination_icao")
          .eq("username", username)
          .limit(20000);
        const set = new Set<string>();
        for (const r of rows ?? []) {
          if (r.departure_icao) set.add(String(r.departure_icao));
          if (r.destination_icao) set.add(String(r.destination_icao));
        }
        return set;
      } catch {
        return new Set<string>();
      }
    })();

    // 4) Portfolio + avatar lookup for focus pilots (parallel, capped).
    const withPortfolios = await Promise.all(
      focus.map(async (p) => {
        let avatarUrl = p.avatarUrl;
        let airports: AllianceAirport[] = [];

        if (p.nonce != null) {
          const pQs = `username=${encodeURIComponent(p.username)}&nonce=${encodeURIComponent(String(p.nonce))}`;
          const [profile, assets] = await Promise.all([
            avatarUrl
              ? Promise.resolve(null)
              : fetchJSON<RawProfile>(`${SIMFLY_BASE}/user/v2/?${pQs}`),
            fetchJSON<RawAssetsAll>(`${SIMFLY_BASE}/user/assets/all?${pQs}`),
          ]);
          if (!avatarUrl && profile?.avatar) {
            avatarUrl = `https://simfly.io/${profile.avatar.replace(/^(\.\.\/)+/, "")}`;
          }
          airports = (assets?.items ?? [])
            .filter((it) => it.type === "Airport" && typeof it.icao === "string")
            .map((it) => {
              const t = tierFor(it.category);
              const used = it.rotation ?? 0;
              const cap = it.maxRotation ?? 0;
              return {
                icao: String(it.icao),
                name: it.name ?? "",
                tier: t.tier,
                tierLabel: t.label,
                level: it.level ?? 0,
                weeklySlots: cap,
                usedSlots: used,
                freeSlots: Math.max(0, cap - used),
              } satisfies AllianceAirport;
            })
            .sort((a, b) => b.weeklySlots - a.weeklySlots);
        }

        const totalWeeklySlots = airports.reduce((s, a) => s + a.weeklySlots, 0);
        const totalFreeSlots = airports.reduce((s, a) => s + a.freeSlots, 0);
        const maxFreeSlots = airports.reduce((m, a) => Math.max(m, a.freeSlots), 0);
        const bestTier = airports.reduce((m, a) => {
          const n = Number(a.tier.replace(/^T/, "")) || 0;
          return n > m ? n : m;
        }, 0);
        const bestLevel = airports.reduce((m, a) => Math.max(m, a.level), 0);

        const returnStatus: AllianceReturnStatus =
          airports.some((a) => myFlownIcaos.has(a.icao))
            ? "completed"
            : "outstanding";

        const recommendation = recommend({
          allianceFactor: p.allianceFactor,
          returnStatus,
          bestTier,
          bestLevel,
          maxFreeSlots,
          totalWeeklySlots,
        });

        return {
          username: p.username,
          nonce: p.nonce,
          avatarUrl,
          visits: p.visits,
          paxForMe: Math.round(p.paxForMe * 100) / 100,
          allianceFactor: Math.round(p.allianceFactor * 100) / 100,
          lastVisitAt: p.lastVisitAt,
          returnStatus,
          camp: "trek" as AllianceCamp, // assigned after sort below
          airports,
          totalFreeSlots,
          totalWeeklySlots,
          recommendation,
        } satisfies AlliancePilot;
      }),
    );

    // Assign camps based on final Alliance Factor order.
    const finalRanked = withPortfolios.sort(
      (a, b) => b.allianceFactor - a.allianceFactor,
    );
    finalRanked.forEach((p, i) => {
      p.camp = assignCamp(i);
    });

    const outstandingReturns = finalRanked.filter(
      (p) => p.returnStatus === "outstanding",
    ).length;
    const totalAllianceFactor =
      Math.round(
        finalRanked.reduce((s, p) => s + p.allianceFactor, 0) * 100,
      ) / 100;

      const payload: AllianceIntelPayload = {
        generatedAt: new Date().toISOString(),
        me: { username },
        totals: {
          pilots: finalRanked.length,
          totalAllianceFactor,
          outstandingReturns,
        },
        pilots: finalRanked,
      };

      // Persist to cache (best-effort — never fail the request on write error).
      try {
        await (supabaseAdmin as unknown as {
          from: (t: string) => {
            upsert: (row: Record<string, unknown>, opts: { onConflict: string }) => Promise<unknown>;
          };
        })
          .from("alliance_intel_cache")
          .upsert(
            {
              username,
              payload,
              generated_at: payload.generatedAt,
              refresh_after: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
            },
            { onConflict: "username" },
          );
      } catch {
        // ignore cache write failure
      }

      return payload;
    } catch (err) {
      // SimFly hiccup — serve stale cache if we have one so the UI stays alive.
      const stale = await readStale();
      if (stale) return stale;
      throw err;
    }
  });

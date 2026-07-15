import { createServerFn } from "@tanstack/react-start";
// -----------------------------------------------------------------------------
// Income Intelligence — active vs passive income breakdown from HUB flights.
// Sources data exclusively from `simfly_flights` (no SimFly API history scans),
// plus a light `/user/assets/all` call to resolve owned airport ICAOs.
// -----------------------------------------------------------------------------
export type IncomeRange = "7d" | "30d" | "90d" | "365d" | "all";
export type IncomePoint = {
  date: string; // YYYY-MM-DD
  active: number;
  passive: number;
  total: number;
};
export type IncomeComponent = {
  key: "active_missions" | "passive_visitors";
  label: string;
  amount: number;
  flights: number;
};
export type IncomeSummaryPayload = {
  generatedAt: string;
  me: { username: string };
  range: IncomeRange;
  rangeStart: string;
  totals: {
    active: number;
    passive: number;
    total: number;
    activeFlights: number;
    passiveFlights: number;
    ownedAirports: number;
  };
  composition: IncomeComponent[];
  timeseries: IncomePoint[];
  kpis: {
    passiveShare: number; // 0..1
    dailyAverage: number;
    passiveMomentum: number | null; // last30 / prev30
    concentration: number; // HHI 0..1 across owned airports (passive PAX)
    topAirport: { icao: string; pax: number } | null;
    coverageFlights: number; // total rows considered
  };
  perAirportPassive: { icao: string; name: string; pax: number; flights: number }[];
  coverage: {
    earliestFlight: string | null;
    latestFlight: string | null;
    note: string;
  };
};
const SIMFLY_BASE = "https://simfly.io/api";
async function fetchOwnedAirports(username: string, nonce: string): Promise<{ icao: string; name: string }[]> {
  try {
    const res = await fetch(
      `${SIMFLY_BASE}/user/assets/all?username=${encodeURIComponent(username)}&nonce=${encodeURIComponent(nonce)}`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) return [];
    const json = (await res.json()) as { items?: { type?: string; icao?: string; name?: string }[] };
    return (json.items ?? [])
      .filter((i) => i.type === "Airport" && typeof i.icao === "string")
      .map((i) => ({ icao: i.icao as string, name: i.name ?? (i.icao as string) }));
  } catch {
    return [];
  }
}
function rangeStartIso(range: IncomeRange): string | null {
  const now = Date.now();
  const day = 86_400_000;
  switch (range) {
    case "7d":
      return new Date(now - 7 * day).toISOString();
    case "30d":
      return new Date(now - 30 * day).toISOString();
    case "90d":
      return new Date(now - 90 * day).toISOString();
    case "365d":
      return new Date(now - 365 * day).toISOString();
    case "all":
    default:
      return null;
  }
}
function dateKey(iso: string): string {
  return iso.slice(0, 10);
}
export const getIncomeSummary = createServerFn({ method: "GET" })
  .inputValidator((d?: { username?: string; range?: IncomeRange }) => ({
    username: d?.username,
    range: (d?.range ?? "30d") as IncomeRange,
  }))
  .handler(async ({ data }): Promise<IncomeSummaryPayload> => {
    const { getSessionIdentity } = await import("@/lib/identity.server");
    const identity = await getSessionIdentity({ username: data.username });
    const username = identity.username;
    const range = data.range;
    const startIso = rangeStartIso(range);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const owned = await fetchOwnedAirports(username, identity.nonce);
    const ownedIcaos = owned.map((a) => a.icao);
    const ownedNameByIcao = new Map(owned.map((a) => [a.icao, a.name]));

    // =========================================================================
    // 🟢 Dodatkowa funkcja: POBIERANIE NUMERÓW REJESTRACYJNYCH TWOJEJ FLOTY
    // =========================================================================
    const { data: myAircrafts } = await supabaseAdmin
      .from("simfly_aircraft")
      .select("tail_number")
      .eq("owner_username", username);
      
    const myTails = (myAircrafts ?? []).map(a => (a.tail_number || "").toUpperCase().trim());
    // =========================================================================

    
    // 1) Active income — my flights.
    let activeQuery = supabaseAdmin
      .from("simfly_flights")
      .select("mission_start_ts, total_reward, pax")
      .eq("username", username)
      .order("mission_start_ts", { ascending: true })
      .limit(20000);
    if (startIso) activeQuery = activeQuery.gte("mission_start_ts", startIso);
    // 2) Passive proxy — visitor arrivals to my airports (excluding me).
    let passiveRows: { mission_start_ts: string | null; pax: number | null; destination_icao: string | null }[] = [];
    if (ownedIcaos.length > 0) {
      let passiveQuery = supabaseAdmin
        .from("simfly_flights")
        .select("mission_start_ts, pax, destination_icao")
        .neq("username", username)
        .in("destination_icao", ownedIcaos)
        .order("mission_start_ts", { ascending: true })
        .limit(20000);
      if (startIso) passiveQuery = passiveQuery.gte("mission_start_ts", startIso);
      const { data: rows } = await passiveQuery;
      passiveRows = (rows ?? []) as typeof passiveRows;
    }

        // =========================================================================
    // 🟢 KROK 2: TRZECIE, NIEZALEŻNE ZAPYTANIE — CZYSTY ZYSK Z LEASINGU FLOTY
    // =========================================================================
       let fleetLeaseRows: { mission_start_ts: string | null; pax: number | null; destination_icao: string | null; aircraft_tail_number: string | null }[] = [];
    
    if (myTails.length > 0) {
      let fleetQuery = supabaseAdmin
        .from("simfly_flights")
        // 🔥 DODAJEMY "raw" DO SELECTA, ABY MÓC PRZESZUKAĆ SUROWY LOG JSONB Z APILOTU!
        .select("mission_start_ts, pax, destination_icao, aircraft_tail_number, raw")
        .neq("username", username);
        
      if (ownedIcaos.length > 0) {
        fleetQuery = fleetQuery.not("destination_icao", "in", `(${ownedIcaos.join(",")})`);
      }
        
      if (startIso) fleetQuery = fleetQuery.gte("mission_start_ts", startIso);
      fleetQuery = fleetQuery.order("mission_start_ts", { ascending: true }).limit(20000);
      
      const { data: fRows } = await fleetQuery;
      
      // 🔥 PANCERNY PARSER: Filtrujemy dane, oczyszczając rejestracje z myślników i spacji!
      if (fRows && fRows.length > 0) {
        fleetLeaseRows = fRows.filter((r: any) => {
          const colTail = (r.aircraft_tail_number || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
          const rawTail = (r.raw?.aircraft_tail_number || r.raw?.tail_number || "")
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, "");
            
          const cleanMyTails = myTails.map(t => t.replace(/[^A-Z0-9]/g, ""));
          return cleanMyTails.includes(colTail) || cleanMyTails.includes(rawTail);
        }).map((r: any) => ({
          mission_start_ts: r.mission_start_ts,
          pax: r.pax,
          destination_icao: r.destination_icao,
          aircraft_tail_number: r.aircraft_tail_number || r.raw?.aircraft_tail_number || r.raw?.tail_number || ""
        }));
      }
    }

    // =========================================================================

    
    const { data: activeData } = await activeQuery;
    const activeRows =
      ((activeData ?? []) as { mission_start_ts: string | null; total_reward: number | null; pax: number | null }[]);
    // Bucket by day.
    const buckets = new Map<string, IncomePoint>();
    let totalActive = 0;
    let activeFlights = 0;
    for (const r of activeRows) {
      if (!r.mission_start_ts) continue;
      const amt = Number(r.pax ?? 0) || 0;
      totalActive += amt;
      activeFlights += 1;
      const k = dateKey(r.mission_start_ts);
      const cur = buckets.get(k) ?? { date: k, active: 0, passive: 0, total: 0 };
      cur.active += amt;
      cur.total += amt;
      buckets.set(k, cur);
    }
    let totalPassive = 0;
    let passiveFlights = 0;
    const perAirportPassive = new Map<string, { pax: number; flights: number }>();
    // =========================================================================
    // 🟢 WKLEJ TO DOKŁADNIE TUTAJ (Pod 'const perAirportPassive...'):
    // =========================================================================
    const perAircraftPassive = new Map<string, { pax: number; flights: number }>();
    // =========================================================================
    for (const r of passiveRows) {
      if (!r.mission_start_ts) continue;
      const amt = Number(r.pax ?? 0) || 0;
      totalPassive += amt;
      passiveFlights += 1;
      const k = dateKey(r.mission_start_ts);
      const cur = buckets.get(k) ?? { date: k, active: 0, passive: 0, total: 0 };
      cur.passive += amt;
      cur.total += amt;
      buckets.set(k, cur);
      if (r.destination_icao) {
        const cur2 = perAirportPassive.get(r.destination_icao) ?? { pax: 0, flights: 0 };
        cur2.pax += amt;
        cur2.flights += 1;
        perAirportPassive.set(r.destination_icao, cur2);
      }
      // =========================================================================
      // 🟢 KROK B-1: ZLICZANIE FLOTY NA TWOICH LOTNISKACH (Wklejasz w linii 204)
      // =========================================================================
      const tail = (r.aircraft_tail_number || "").toUpperCase().trim();
      if (tail && myTails.includes(tail)) {
        const curFleet = perAircraftPassive.get(tail) ?? { pax: 0, flights: 0 };
        curFleet.pax += amt; // Zliczamy tokeny PAX
        curFleet.flights += 1;
        perAircraftPassive.set(tail, curFleet);
      }
    }
        // 🟢 KROK B-2: NOWA PĘTLA DLA TWOICH SAMOLOTÓW NA OBCYCH PORTACH (Wklejasz w linii 216)
    for (const r of fleetLeaseRows) {
      if (!r.mission_start_ts) continue;
      const k = dateKey(r.mission_start_ts);
      const tokenEarnings = Number(r.pax ?? 0) || 0;
      
      totalPassive += tokenEarnings;
      passiveFlights += 1;

      const cur = buckets.get(k) ?? { date: k, active: 0, passive: 0, total: 0 };
      cur.passive += tokenEarnings;
      cur.total += tokenEarnings;
      buckets.set(k, cur);

      const tail = (r.aircraft_tail_number || "").toUpperCase().trim();
      if (tail) {
        const curFleet = perAircraftPassive.get(tail) ?? { pax: 0, flights: 0 };
        curFleet.pax += tokenEarnings;
        curFleet.flights += 1;
        perAircraftPassive.set(tail, curFleet);
      }
    }

    // Fill gaps in the timeseries for continuous charts.
    const timeseries = fillDailyGaps(buckets, startIso);
    // KPIs.
    const total = totalActive + totalPassive;
    const passiveShare = total > 0 ? totalPassive / total : 0;
    const days = Math.max(1, timeseries.length);
    const dailyAverage = total / days;
    // 30d vs prior 30d momentum on passive stream.
    const now = Date.now();
    const day = 86_400_000;
    let last30 = 0;
    let prev30 = 0;
    for (const r of passiveRows) {
      if (!r.mission_start_ts) continue;
      const t = new Date(r.mission_start_ts).getTime();
      const age = now - t;
      const amt = Number(r.pax ?? 0) || 0;
      if (age <= 30 * day) last30 += amt;
      else if (age <= 60 * day) prev30 += amt;
    }
    const passiveMomentum = prev30 > 0 ? last30 / prev30 : null;
    // HHI concentration on passive per-airport pax.
    const totalPassivePax = Array.from(perAirportPassive.values()).reduce((s, v) => s + v.pax, 0);
    let hhi = 0;
    if (totalPassivePax > 0) {
      for (const v of perAirportPassive.values()) {
        const share = v.pax / totalPassivePax;
        hhi += share * share;
      }
    }
    const perAirportArr = Array.from(perAirportPassive.entries())
      .map(([icao, v]) => ({
        icao,
        name: ownedNameByIcao.get(icao) ?? icao,
        pax: v.pax,
        flights: v.flights,
      }))
      .sort((a, b) => b.pax - a.pax);
    const topAirport = perAirportArr[0] ? { icao: perAirportArr[0].icao, pax: perAirportArr[0].pax } : null;
    const composition: IncomeComponent[] = [
      { key: "active_missions", label: "Active — Mission Rewards", amount: totalActive, flights: activeFlights },
      { key: "passive_visitors", label: "Passive — Visitor Arrivals", amount: totalPassive, flights: passiveFlights },
    ];
    const earliest = timeseries[0]?.date ?? null;
    const latest = timeseries[timeseries.length - 1]?.date ?? null;
    return {
      generatedAt: new Date().toISOString(),
      me: { username },
      range,
      rangeStart: startIso ?? (earliest ? `${earliest}T00:00:00.000Z` : new Date(0).toISOString()),
      totals: {
        active: totalActive,
        passive: totalPassive,
        total,
        activeFlights,
        passiveFlights,
        ownedAirports: owned.length,
      },
      composition,
      timeseries,
      kpis: {
        passiveShare,
        dailyAverage,
        passiveMomentum,
        concentration: hhi,
        topAirport,
        coverageFlights: activeFlights + passiveFlights,
      },
      perAirportPassive: perAirportArr,
       // =========================================================================
      // 🟢 KROK C: SFORMATOWANIE I WYPUSZCZENIE TABLICY FLOTY DO FRONTENDU (Linia 308)
      // =========================================================================
      perAircraftPassive: Array.from(perAircraftPassive.entries())
        .map(([tail, v]) => ({
          tailNumber: tail,
          pax: v.pax,
          flights: v.flights,
        }))
        .sort((a, b) => b.pax - a.pax),
      // =========================================================================
      coverage: {
        earliestFlight: earliest,
        latestFlight: latest,
        note:
          "Active income = mission rewards on your logged flights. Passive income = PAX generated by other pilots' arrivals at your owned airports, from indexed HUB flight history. Coverage grows as more pilots' logbooks are backfilled into the Hub.",
      },
    };
  });
function fillDailyGaps(
  buckets: Map<string, IncomePoint>,
  startIso: string | null,
): IncomePoint[] {
  const keys = Array.from(buckets.keys()).sort();
  if (keys.length === 0) return [];
  const startKey = startIso ? startIso.slice(0, 10) : keys[0];
  const endKey = new Date().toISOString().slice(0, 10);
  const out: IncomePoint[] = [];
  const cur = new Date(`${startKey}T00:00:00Z`);
  const end = new Date(`${endKey}T00:00:00Z`);
  while (cur.getTime() <= end.getTime()) {
    const k = cur.toISOString().slice(0, 10);
    out.push(buckets.get(k) ?? { date: k, active: 0, passive: 0, total: 0 });
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}
 

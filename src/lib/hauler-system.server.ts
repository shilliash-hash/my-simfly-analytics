/** SimFly's public airport catalogue (system airports included), cached in-process for an hour. */
type Row = { ICAO?: string; name?: string; category?: number; lat?: number; lng?: number; country?: string; owner?: string };
/** `owner` is the player username; absent means SimFly owns it (system airport). */
export type SystemAirport = { icao: string; name: string; tier: number; lat: number; lng: number; country: string; owner?: string };
type Catalogue = { at: number; list: SystemAirport[]; byIcao: Map<string, SystemAirport> };
let memo: Catalogue | null = null;
let loading: Promise<Catalogue> | null = null;
export async function systemCatalogue(): Promise<Catalogue> {
  if (memo && Date.now() - memo.at < 3600_000) return memo;
  loading ??= (async () => {
    const res = await fetch("https://simfly.io/api/airports/v2", { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error("SimFly airport list unavailable");
    const body = await res.json() as { data?: Row[] };
    const list: SystemAirport[] = [];
    for (const r of body.data ?? []) {
      const icao = (r.ICAO ?? "").toUpperCase();
      if (!/^[A-Z0-9]{2,5}$/.test(icao) || typeof r.lat !== "number" || typeof r.lng !== "number") continue;
      list.push({ icao, name: r.name ?? icao, tier: r.category ?? 1, lat: r.lat, lng: r.lng, country: r.country ?? "", owner: typeof r.owner === "string" && r.owner.trim() ? r.owner : undefined });
    }
    list.sort((a, b) => a.icao.localeCompare(b.icao));
    const next: Catalogue = { at: Date.now(), list, byIcao: new Map(list.map(a => [a.icao, a])) };
    memo = next;
    return next;
  })().finally(() => { loading = null; });
  return loading;
}

/** Is this a SimFly-owned (system) airport? true / false, or null when SimFly's catalogue is unavailable or does not list it. */
export async function isSystemAirport(icao: string): Promise<boolean | null> {
  try { const a = (await systemCatalogue()).byIcao.get(icao); return a ? !a.owner : null; }
  catch { return null; }
}

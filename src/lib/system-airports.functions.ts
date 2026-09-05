// System Airports Analyzer — thin server-function wrappers (client-safe import).
import { createServerFn } from "@tanstack/react-start";
import type {
  RadarDetail,
  SystemAirportWatchRow,
  SystemDiscovery,
} from "./system-airports.types";
import { DEFAULT_WINDOW_DAYS, WINDOW_DAYS } from "./system-airports.types";

function cleanTiers(raw?: number[]): number[] {
  const list = (raw ?? [3, 4]).filter((t) => Number.isInteger(t) && t >= 1 && t <= 6);
  return list.length ? [...new Set(list)] : [3, 4];
}

function cleanWindow(raw?: number): number {
  const v = Number(raw ?? DEFAULT_WINDOW_DAYS);
  return WINDOW_DAYS.includes(v) ? v : DEFAULT_WINDOW_DAYS;
}

export const getSystemAirportAccess = createServerFn({ method: "GET" })
  .inputValidator((d?: { username?: string }) => d ?? {})
  .handler(async ({ data }): Promise<{ username: string; allowed: boolean }> => {
    const { resolveIdentityUsername } = await import("./airport-spy-identity.server");
    const username = await resolveIdentityUsername(data.username);
    const { isAirportSpyPermitted } = await import("./airport-spy.server");
    return { username, allowed: await isAirportSpyPermitted(username) };
  });

export const getSystemAirportDiscovery = createServerFn({ method: "GET" })
  .inputValidator((d: { tiers?: number[]; windowDays?: number; username?: string }) => d)
  .handler(async ({ data }): Promise<SystemDiscovery> => {
    const { resolveIdentityUsername } = await import("./airport-spy-identity.server");
    const username = await resolveIdentityUsername(data.username);
    const { assertAirportSpyAccess } = await import("./airport-spy.server");
    await assertAirportSpyAccess(username);
    const { buildDiscovery } = await import("./system-airports.server");
    return buildDiscovery({
      username,
      tiers: cleanTiers(data.tiers),
      windowDays: cleanWindow(data.windowDays),
    });
  });

export const runSystemAirportScan = createServerFn({ method: "POST" })
  .inputValidator((d: { tiers?: number[]; windowDays?: number; username?: string }) => d)
  .handler(async ({ data }) => {
    const { resolveIdentityUsername } = await import("./airport-spy-identity.server");
    const username = await resolveIdentityUsername(data.username);
    const { assertAirportSpyAccess } = await import("./airport-spy.server");
    await assertAirportSpyAccess(username);
    const { runScanStep } = await import("./system-airports.server");
    return runScanStep({
      username,
      tiers: cleanTiers(data.tiers),
      windowDays: cleanWindow(data.windowDays),
    });
  });

export const listSystemAirportWatch = createServerFn({ method: "GET" })
  .inputValidator((d?: { username?: string }) => d ?? {})
  .handler(async ({ data }): Promise<SystemAirportWatchRow[]> => {
    const { resolveIdentityUsername } = await import("./airport-spy-identity.server");
    const username = await resolveIdentityUsername(data.username);
    const { assertAirportSpyAccess } = await import("./airport-spy.server");
    await assertAirportSpyAccess(username);
    const { listWatch } = await import("./system-airports.server");
    return listWatch(username);
  });

export const addSystemAirportWatch = createServerFn({ method: "POST" })
  .inputValidator((d: { icao: string; notes?: string; username?: string }) => d)
  .handler(async ({ data }) => {
    const { resolveIdentityUsername } = await import("./airport-spy-identity.server");
    const username = await resolveIdentityUsername(data.username);
    const { assertAirportSpyAccess } = await import("./airport-spy.server");
    await assertAirportSpyAccess(username);
    const { addWatch } = await import("./system-airports.server");
    return addWatch(username, data.icao, data.notes);
  });

export const removeSystemAirportWatch = createServerFn({ method: "POST" })
  .inputValidator((d: { icao: string; username?: string }) => d)
  .handler(async ({ data }) => {
    const { resolveIdentityUsername } = await import("./airport-spy-identity.server");
    const username = await resolveIdentityUsername(data.username);
    const { assertAirportSpyAccess } = await import("./airport-spy.server");
    await assertAirportSpyAccess(username);
    const { removeWatch } = await import("./system-airports.server");
    return removeWatch(username, data.icao);
  });

export const openSystemAirportWatch = createServerFn({ method: "POST" })
  .inputValidator((d: { icao: string; username?: string }) => d)
  .handler(async ({ data }) => {
    const { resolveIdentityUsername } = await import("./airport-spy-identity.server");
    const username = await resolveIdentityUsername(data.username);
    const { assertAirportSpyAccess } = await import("./airport-spy.server");
    await assertAirportSpyAccess(username);
    const { touchWatch } = await import("./system-airports.server");
    await touchWatch(username, data.icao);
    return { ok: true as const };
  });

export const getSystemAirportRadarDetail = createServerFn({ method: "GET" })
  .inputValidator((d: { icao: string; windowDays?: number; username?: string }) => d)
  .handler(async ({ data }): Promise<RadarDetail> => {
    const { resolveIdentityUsername } = await import("./airport-spy-identity.server");
    const username = await resolveIdentityUsername(data.username);
    const { assertAirportSpyAccess } = await import("./airport-spy.server");
    await assertAirportSpyAccess(username);
    const { loadAirportRadarDetail } = await import("./system-airports.server");
    return loadAirportRadarDetail(data.icao, cleanWindow(data.windowDays));
  });

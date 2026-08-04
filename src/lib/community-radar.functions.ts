// Community Radar — server function wrappers (thin by design).

import { createServerFn } from "@tanstack/react-start";
import type { AirportIdentity, RadarWeek } from "./community-radar.types";

export const getCommunityWeek = createServerFn({ method: "GET" })
  .inputValidator((d?: { weekOffset?: number }) => ({ weekOffset: d?.weekOffset ?? 0 }))
  .handler(async ({ data }): Promise<RadarWeek> => {
    const { computeCommunityWeek } = await import("./community-radar.server");
    return computeCommunityWeek(data.weekOffset);
  });

export const getRadarAirportIdentity = createServerFn({ method: "GET" })
  .inputValidator((d: { icao: string }) => {
    const icao = (d?.icao ?? "").trim().toUpperCase();
    if (!icao) throw new Error("Missing ICAO");
    return { icao };
  })
  .handler(async ({ data }): Promise<AirportIdentity> => {
    const { resolveAirportIdentity } = await import("./community-radar.server");
    return resolveAirportIdentity(data.icao);
  });

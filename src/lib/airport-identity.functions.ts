// Shared airport identity — thin server-function wrapper (client-safe import).
import { createServerFn } from "@tanstack/react-start";
import type { AirportIdentityFull } from "./airport-identity.types";

export const getAirportIdentity = createServerFn({ method: "GET" })
  .inputValidator((d: { icao: string }) => ({ icao: (d?.icao ?? "").trim().toUpperCase() }))
  .handler(async ({ data }): Promise<AirportIdentityFull> => {
    const { resolveAirportIdentityFull } = await import("./airport-identity.server");
    return resolveAirportIdentityFull(data.icao);
  });

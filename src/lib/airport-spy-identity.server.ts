// Thin server-only bridge to the Hub identity layer, so Airport Spy never
// duplicates nonce resolution.
import { getSessionIdentity } from "./identity.server";

export async function resolveIdentityPair(username?: string) {
  return getSessionIdentity(username ? { username } : undefined);
}

export async function resolveIdentityUsername(username?: string): Promise<string> {
  const id = await getSessionIdentity(username ? { username } : undefined);
  return id.username;
}

// Client-side store for the SimFly session identity (username the pilot
// signed the HUB in as). Stage 1 of the identity-layer migration.
// Persisted in localStorage so a hard refresh keeps the session.
import { useSyncExternalStore } from "react";
const KEY = "simfly:sessionUser";
const listeners = new Set<() => void>();
let cached: string | null = null;
let initialized = false;
function read(): string | null {
  if (typeof window === "undefined") return null;
  if (!initialized) {
    try {
      cached = window.localStorage.getItem(KEY);
    } catch {
      cached = null;
    }
    initialized = true;
  }
  return cached;
}
export function setSessionUser(u: string | null) {
  if (typeof window === "undefined") return;
  const next = u && u.trim() ? u.trim() : null;
  cached = next;
  initialized = true;
  try {
    if (next) window.localStorage.setItem(KEY, next);
    else window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  for (const l of listeners) l();
}
export function getSessionUserSync(): string | null {
  return read();
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
export function useSessionUser(): string | null {
  return useSyncExternalStore(subscribe, read, () => null);
}

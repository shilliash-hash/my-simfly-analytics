// Client-side store for the "viewing as" SimFly pilot. Defaults to null,
// in which case the server falls back to SIMFLY_USERNAME (the logged-in pilot).
// Persisted in localStorage so navigation keeps the selection.
import { useSyncExternalStore } from "react";

const KEY = "simfly:viewedUser";
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

export function setViewedUser(u: string | null) {
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

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useViewedUser(): string | null {
  return useSyncExternalStore(subscribe, read, () => null);
}

/** Helper for callers: stable query-key tag + payload for server fns. */
export function useSimflyArgs() {
  const username = useViewedUser();
  return {
    username,
    keyTag: username ?? "__self__",
    payload: username ? { username } : undefined,
  };
}

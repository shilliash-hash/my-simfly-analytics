// Client-side store for the admin token. Stored in localStorage so admin
// actions persist across refreshes. The token is sent to server functions
// which validate it against the ADMIN_TOKEN env var.
import { useSyncExternalStore } from "react";

const KEY = "simfly:adminToken";
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

export function setAdminToken(t: string | null) {
  if (typeof window === "undefined") return;
  const next = t && t.trim() ? t.trim() : null;
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

export function useAdminToken(): string | null {
  return useSyncExternalStore(subscribe, read, () => null);
}

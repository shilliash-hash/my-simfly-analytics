// Client-side store for the SimFly session identity (username the pilot
// signed the HUB in as). Stage 1 of the identity-layer migration.
// Persisted in localStorage so a hard refresh keeps the session.
import { useEffect, useSyncExternalStore } from "react";

const KEY = "simfly:sessionUser";
const listeners = new Set<() => void>();

let cached: string | null = null;
let initialized = false;
let hydrated = false;

function readStorage(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function snapshot(): string | null {
  return hydrated ? cached : null;
}

function hydrate() {
  if (typeof window === "undefined" || hydrated) return;
  cached = readStorage();
  initialized = true;
  hydrated = true;
  for (const l of listeners) l();
}

export function setSessionUser(u: string | null) {
  if (typeof window === "undefined") return;
  const next = u && u.trim() ? u.trim() : null;
  cached = next;
  initialized = true;
  hydrated = true;
  try {
    if (next) window.localStorage.setItem(KEY, next);
    else window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  for (const l of listeners) l();
}

export function getSessionUserSync(): string | null {
  const value = readStorage();
  if (hydrated) cached = value;
  else initialized = true;
  return value;
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useSessionUser(): string | null {
  useEffect(() => {
    hydrate();
  }, []);
  return useSyncExternalStore(subscribe, snapshot, () => null);
}

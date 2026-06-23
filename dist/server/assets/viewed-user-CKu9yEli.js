import { useSyncExternalStore } from "react";
const KEY = "simfly:viewedUser";
const listeners = /* @__PURE__ */ new Set();
let cached = null;
let initialized = false;
function read() {
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
function setViewedUser(u) {
  if (typeof window === "undefined") return;
  const next = u && u.trim() ? u.trim() : null;
  cached = next;
  initialized = true;
  try {
    if (next) window.localStorage.setItem(KEY, next);
    else window.localStorage.removeItem(KEY);
  } catch {
  }
  for (const l of listeners) l();
}
function subscribe(l) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
function useViewedUser() {
  return useSyncExternalStore(subscribe, read, () => null);
}
function useSimflyArgs() {
  const username = useViewedUser();
  return {
    username,
    keyTag: username ?? "__self__",
    payload: username ? { username } : void 0
  };
}
export {
  setViewedUser as s,
  useSimflyArgs as u
};

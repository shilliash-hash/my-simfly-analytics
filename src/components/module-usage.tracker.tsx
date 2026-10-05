import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useSessionUser } from "@/lib/session-user";
import { moduleFromPath } from "@/lib/module-usage";
import { recordModuleVisit } from "@/lib/module-usage.functions";

/** Invisible: records one visit per module change for the signed-in pilot. */
export function ModuleUsageTracker() {
  const user = useSessionUser();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const record = useServerFn(recordModuleVisit);
  const last = useRef<string>("");

  useEffect(() => {
    const module = moduleFromPath(pathname);
    if (!user || !module) return;
    const key = `${user}|${module}`;
    if (last.current === key) return;
    last.current = key;
    void record({ data: { username: user, module } }).catch(() => {});
  }, [user, pathname, record]);

  return null;
}

import { createServerFn } from "@tanstack/react-start";
import { createHash, timingSafeEqual } from "node:crypto";
import { MODULE_LABELS } from "./module-usage";

function cleanUser(raw: unknown): string {
  const v = String(raw ?? "").trim();
  return /^[A-Za-z0-9_.-]{1,40}$/.test(v) ? v : "";
}

/** Public, best-effort: record one module visit for a pilot. */
export const recordModuleVisit = createServerFn({ method: "POST" })
  .inputValidator((d: { username: string; module: string }) => d)
  .handler(async ({ data }) => {
    const username = cleanUser(data.username);
    const module = String(data.module ?? "");
    if (!username || !(module in MODULE_LABELS)) return { ok: false };
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await supabaseAdmin.rpc("touch_module_usage", { _username: username, _module: module });
    } catch {
      /* best effort */
    }
    return { ok: true };
  });

export type ModuleUsageCell = { username: string; module: string; hits: number; lastSeenAt: string };

/** Admin-only: aggregated user × module usage over the last N days. */
export const getModuleUsageHeatmap = createServerFn({ method: "POST" })
  .inputValidator((d: { token: string; days: number }) => d)
  .handler(async ({ data }): Promise<{ days: number; cells: ModuleUsageCell[] }> => {
    const expected = process.env.ADMIN_TOKEN;
    if (!expected) throw new Error("ADMIN_TOKEN is not configured on the server.");
    const a = createHash("sha256").update(String(data.token ?? "")).digest();
    const b = createHash("sha256").update(expected).digest();
    if (!timingSafeEqual(a, b)) throw new Error("Forbidden: invalid admin token.");

    const days = Math.min(Math.max(Math.round(Number(data.days) || 30), 1), 30);
    const since = new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("module_usage_daily")
      .select("username, module, hits, last_seen_at")
      .gte("day", since)
      .limit(10000);
    if (error) throw new Error(error.message);

    const map = new Map<string, ModuleUsageCell>();
    for (const r of rows ?? []) {
      const k = `${r.username}|${r.module}`;
      const cur = map.get(k);
      if (!cur) map.set(k, { username: r.username, module: r.module, hits: r.hits, lastSeenAt: r.last_seen_at });
      else {
        cur.hits += r.hits;
        if (r.last_seen_at > cur.lastSeenAt) cur.lastSeenAt = r.last_seen_at;
      }
    }
    return { days, cells: [...map.values()] };
  });

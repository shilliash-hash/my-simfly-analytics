import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getSimflyPayload } from "@/lib/simfly.functions";
import { useSimflyArgs } from "@/lib/viewed-user";
import type { AirportExt } from "@/lib/types";
import { AppShell, PageHeader, TierPill, RotationCell, formatNumber } from "@/components/app-shell";
import { X, Plus } from "lucide-react";

export const Route = createFileRoute("/compare")({
  component: Compare,
  head: () => ({
    meta: [
      { title: "Compare — SimFly Hub" },
      { name: "description", content: "Side-by-side comparison of up to 4 SimFly airports." },
    ],
  }),
});

function Compare() {
  const fn = useServerFn(getSimflyPayload);
  const { keyTag, payload } = useSimflyArgs();
  const { data } = useSuspenseQuery(queryOptions({
    queryKey: ["simfly", keyTag],
    queryFn: () => fn(payload ? { data: payload } : undefined),
  }));
  const [selected, setSelected] = useState<string[]>(
    [...data.airports]
      .sort((a, b) => b.totalEarnedPax - a.totalEarnedPax)
      .slice(0, 3)
      .map((a) => a.icao),
  );
  const airports = selected
    .map((id) => data.airports.find((h) => h.icao === id))
    .filter((a): a is AirportExt => !!a);

  return (
    <AppShell>
      <PageHeader
        eyebrow="Side-by-side"
        title="Compare hubs"
        description="Pick up to 4 airports and benchmark them across tier, level and PAX flow."
      />

      <div className="panel mb-6 flex flex-wrap items-center gap-2 rounded-xl p-3">
        <span className="mono mr-2 text-[11px] uppercase tracking-widest text-muted-foreground">Available:</span>
        {data.airports.map((h) => {
          const on = selected.includes(h.icao);
          const disabled = !on && selected.length >= 4;
          return (
            <button
              key={h.icao}
              disabled={disabled}
              onClick={() =>
                setSelected((s) => (on ? s.filter((x) => x !== h.icao) : [...s, h.icao]))
              }
              className={`mono rounded px-2 py-1 text-[11px] uppercase tracking-widest transition-colors ${
                on
                  ? "bg-primary text-primary-foreground"
                  : disabled
                    ? "cursor-not-allowed bg-secondary/40 text-muted-foreground/40"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {on ? <X className="mr-1 inline h-3 w-3" /> : <Plus className="mr-1 inline h-3 w-3" />}
              {h.icao}
            </button>
          );
        })}
      </div>

      {airports.length === 0 ? (
        <p className="text-sm text-muted-foreground">Pick at least one airport to compare.</p>
      ) : (
        <div className="panel overflow-x-auto rounded-xl">
          <table className="w-full text-sm">
            <thead className="mono bg-secondary/40 text-[10px] uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Metric</th>
                {airports.map((a) => (
                  <th key={a.icao} className="px-4 py-3 text-left">
                    <div className="text-runway">{a.icao}</div>
                    <div className="font-display mt-0.5 text-sm font-semibold normal-case tracking-normal text-foreground">{a.name}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <Row label="Tier" hubs={airports} render={(a) => <TierPill tier={a.tier} label={a.tierLabel} />} />
              <Row label="Level" hubs={airports} mono best={(a) => a.level}
                render={(a) => (
                  <span>
                    L{a.level}{" "}
                    <span className="text-[10px] text-muted-foreground">
                      {Math.round(a.levelProgress)}% to next
                    </span>
                  </span>
                )} />
              <Row label="Lifetime PAX" hubs={airports} mono best={(a) => a.totalEarnedPax}
                render={(a) => formatNumber(Math.round(a.totalEarnedPax))} />
              <Row label="PAX / week (avg 30d)" hubs={airports} mono best={(a) => a.pax30d}
                render={(a) => formatNumber(Math.round((a.pax30d * 7) / 30))} />
              <Row label="PAX last 7d" hubs={airports} mono best={(a) => a.pax7d}
                render={(a) => formatNumber(Math.round(a.pax7d))} />
              <Row label="Rotation" hubs={airports}
                render={(a) => <RotationCell rotation={a.rotation} max={a.maxRotation} />} />
              <Row label="Owner cut" hubs={airports} mono best={(a) => a.percToUser}
                render={(a) => `${a.percToUser}%`} />
              <Row label="Owner" hubs={airports} render={() => `@${data.me.handle}`} />
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}

function Row({
  label, hubs, render, mono, best,
}: {
  label: string;
  hubs: AirportExt[];
  render: (a: AirportExt) => React.ReactNode;
  mono?: boolean;
  best?: (a: AirportExt) => number;
}) {
  const max = best ? Math.max(...hubs.map(best)) : null;
  return (
    <tr className="border-t border-border">
      <td className="mono px-4 py-3 text-[11px] uppercase tracking-widest text-muted-foreground">{label}</td>
      {hubs.map((a) => {
        const isBest = best && best(a) === max && max !== 0;
        return (
          <td key={a.icao} className={`px-4 py-3 ${mono ? "mono" : ""} ${isBest ? "text-runway" : ""}`}>
            {render(a)}
          </td>
        );
      })}
    </tr>
  );
}

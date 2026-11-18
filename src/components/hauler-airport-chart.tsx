import { useMemo, useState } from "react";
import { BarChart3 } from "lucide-react";
import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { airportPaxHistory, HISTORY_BUCKET_MS, type HistoryFlight } from "@/lib/hauler-history";

const config = {
  arrived: { label: "Delivered in (paid)", color: "var(--runway)" },
  departed: { label: "Boarded out", color: "var(--instrument)" },
  stock: { label: "Waiting PAX (est.)", color: "var(--foreground)" },
} satisfies ChartConfig;

const fmt = (t: number) => new Date(t).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

type Airport = { icao: string; name: string; capacity: number; current_pax: number; created_at: string };

/** Hub Hauler only: passenger history of one airport, built on request from the public Hauler ledger. Reads nothing from SimFly PAX or income. */
export function HaulerAirportChart({ airport, flights }: { airport: Airport; flights: HistoryFlight[] }) {
  const [open, setOpen] = useState(false);
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger asChild><Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`${airport.icao} passenger history`} title="Passenger history · 30 days"><BarChart3 className="h-4 w-4" /></Button></DialogTrigger>
    <DialogContent className="max-w-3xl">{open && <HistoryBody airport={airport} flights={flights} />}</DialogContent>
  </Dialog>;
}

function HistoryBody({ airport, flights }: { airport: Airport; flights: HistoryFlight[] }) {
  const rows = useMemo(() => airportPaxHistory(airport, flights, Date.now()).map(r => ({ ...r, label: fmt(r.start), end: fmt(r.start + HISTORY_BUCKET_MS) })), [airport, flights]);
  const departed = rows.reduce((n, r) => n + r.departed, 0), arrived = rows.reduce((n, r) => n + r.arrived, 0), moves = rows.reduce((n, r) => n + r.flights, 0);
  const peak = Math.max(0, ...rows.map(r => r.stock ?? 0));
  return <>
    <DialogHeader>
      <DialogTitle className="font-mono">{airport.icao} · Hub Hauler passengers</DialogTitle>
      <DialogDescription>{airport.name} · last 30 days in 12-hour windows (UTC)</DialogDescription>
    </DialogHeader>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Stat label="Waiting now" value={`${Math.floor(airport.current_pax).toLocaleString()} / ${Math.round(airport.capacity).toLocaleString()}`} />
      <Stat label="Delivered in" value={arrived.toLocaleString()} tone="text-runway" />
      <Stat label="Boarded out" value={departed.toLocaleString()} tone="text-instrument" />
      <Stat label="Hauler flights" value={moves.toLocaleString()} />
    </div>
    <ChartContainer config={config} className="aspect-auto h-72 w-full">
      <ComposedChart data={rows} margin={{ left: 0, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={40} tickFormatter={(v: string) => v.split(",")[0]} />
        <YAxis yAxisId="flow" allowDecimals={false} tickLine={false} axisLine={false} width={36} />
        <YAxis yAxisId="stock" orientation="right" allowDecimals={false} tickLine={false} axisLine={false} width={44} domain={[0, Math.max(peak, Math.round(airport.capacity))]} />
        <ChartTooltip content={<ChartTooltipContent labelFormatter={(_, p) => { const r = p?.[0]?.payload as (typeof rows)[number] | undefined; return r ? `${r.label} – ${r.end} UTC · ${r.flights} flights` : ""; }} />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar yAxisId="flow" dataKey="arrived" fill="var(--color-arrived)" radius={[3, 3, 0, 0]} maxBarSize={10} />
        <Bar yAxisId="flow" dataKey="departed" fill="var(--color-departed)" radius={[3, 3, 0, 0]} maxBarSize={10} />
        <Line yAxisId="stock" dataKey="stock" type="monotone" stroke="var(--color-stock)" strokeOpacity={0.7} strokeWidth={1.5} dot={false} connectNulls={false} />
      </ComposedChart>
    </ChartContainer>
    <p className="text-[11px] text-muted-foreground">Hub Hauler mini-game only — official SimFly PAX, traffic and income are not shown or affected. Bars are verified Hauler ledger movements; the waiting line is estimated from the 10% start, 1%/h regeneration and those movements{peak ? ` (peak ${peak.toLocaleString()})` : ""}.</p>
  </>;
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return <div className="rounded-md border border-border bg-secondary/20 p-3"><p className="text-[10px] uppercase text-muted-foreground">{label}</p><p className={`mt-1 font-mono text-base ${tone ?? ""}`}>{value}</p></div>;
}

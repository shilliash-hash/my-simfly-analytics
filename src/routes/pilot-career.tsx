import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { AppShell, PageHeader, formatNumber } from "@/components/app-shell";
import { getPilotCareer } from "@/lib/pilot-career.functions";
import { useSimflyArgs } from "@/lib/viewed-user";
import { Award, Globe2, Plane, Ruler, Trophy, MapPin } from "lucide-react";
export const Route = createFileRoute("/pilot-career")({
  component: PilotCareerPage,
  head: () => ({
    meta: [
      { title: "Pilot Achievements — SimFly Hub" },
      {
        name: "description",
        content:
          "Personal SimFly career overview: top airports, longest flight, aircraft tier mix and countries visited.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
});
const TIER_COLORS = [
  "var(--runway)",         // T1
  "var(--instrument)",     // T2
  "var(--tier-gold)",      // T3
  "var(--tier-platinum)",  // T4
  "var(--tier-silver)",    // T5
  "var(--tier-bronze)",    // T6
  "var(--muted-foreground)", // unknown
];
function PilotCareerPage() {
  const fn = useServerFn(getPilotCareer);
  const { keyTag, payload, username } = useSimflyArgs();
  const { data, isLoading } = useQuery({
    queryKey: ["pilot-career", keyTag],
    queryFn: () => fn(payload ? { data: payload } : undefined),
    staleTime: 10 * 60_000,
  });
  return (
    <AppShell>
      <PageHeader
        eyebrow="Career"
        title="Pilot Achievements"
        description={
          username
            ? `Personal SimFly career overview for @${username}.`
            : "Your personal SimFly career overview — built from your imported flight history."
        }
      />
      {isLoading ? (
        <div className="panel rounded-xl p-6 text-sm text-muted-foreground">Loading your career…</div>
      ) : !data || data.totalFlights === 0 ? (
        <div className="panel rounded-xl p-8 text-center">
          <Trophy className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            Not enough flight history available yet. Fly a few missions and check back.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <AroundTheWorldCard data={data} />
          <CountriesCard data={data} />
          <MostVisitedCard data={data} />
          <LongestFlightCard data={data} />
          <TierDistributionCard data={data} />
        </div>
      )}
    </AppShell>
  );
}
type PropsData = { data: NonNullable<Awaited<ReturnType<typeof getPilotCareer>>> };
function AroundTheWorldCard({ data }: PropsData) {
  const laps = data.circumferencesFlown;
  return (
    <div className="panel rounded-xl p-5">
      <div className="mb-3 flex items-center gap-2">
        <Globe2 className="h-4 w-4 text-runway" />
        <h3 className="font-display text-lg font-semibold">Around the World</h3>
      </div>
      <div className="mono text-[11px] uppercase tracking-widest text-muted-foreground">Distance flown</div>
      <div className="mt-1 font-display text-3xl font-semibold">
        {formatNumber(data.totalDistanceNm)} <span className="text-base text-muted-foreground">NM</span>
      </div>
      <div className="mt-4 rounded-lg border border-border/60 bg-background/40 p-3">
        <div className="text-xs text-muted-foreground">Equivalent</div>
        <div className="font-display text-2xl font-semibold text-runway">
          {laps.toFixed(2)}× <span className="text-sm font-normal text-muted-foreground">around the globe</span>
        </div>
        <div className="mono mt-1 text-[10px] text-muted-foreground">
          Earth ≈ {formatNumber(data.earthCircumferencesNm)} NM · {data.totalFlights} flights
        </div>
      </div>
    </div>
  );
}

// Mapowanie lotniczych prefiksów ICAO na standardowe kody krajów ISO (dla flag)
const ICAO_TO_ISO: Record<string, string> = {
  EN: "no", ES: "se", EF: "fi", EK: "dk", EI: "ie", EG: "gb", EH: "nl", EB: "be", EL: "lu",
  ED: "de", ET: "de", LF: "fr", LS: "ch", LO: "at", LI: "it", LE: "es", LP: "pt", LG: "gr",
  LT: "tr", LM: "mt", LK: "cz", LZ: "sk", LH: "hu", LR: "ro", LB: "bg", LC: "cy", LD: "hr",
  LJ: "si", LY: "rs", LQ: "ba", LW: "mk", LA: "al", LU: "md", EP: "pl", EE: "ee", EV: "lv",
  EY: "lt", UM: "by", UK: "ua", UU: "ru", UL: "ru", UE: "ru", UN: "ru", US: "ru", BI: "is",
  BG: "gl", KA: "us", KB: "us", KC: "us", KD: "us", KE: "us", KF: "us", KG: "us", KH: "us",
  KI: "us", KJ: "us", KK: "us", KL: "us", KM: "us", KN: "us", KO: "us", KP: "us", KR: "us",
  KS: "us", KT: "us", KU: "us", KV: "us", KW: "us", KX: "us", KY: "us", KZ: "us", PA: "us",
  PH: "us", PG: "gu", PJ: "mp", PK: "mh", CY: "ca", CZ: "ca", MM: "mx", MU: "cu", MD: "do",
  MT: "ht", MK: "jm", MY: "bs", MZ: "bz", MP: "pa", MR: "cr", MS: "sv", MG: "gt", MH: "hn",
  MN: "ni", TA: "ag", TB: "bb", TF: "gp", TG: "gd", TI: "vi", TJ: "pr", TK: "kn", TL: "lc",
  TN: "bq", TQ: "ai", TR: "ms", TT: "tt", TU: "vg", TV: "vc", TX: "ky", SA: "ar", SB: "br",
  SC: "cl", SD: "br", SE: "ec", SG: "py", SK: "co", SL: "bo", SM: "sr", SO: "gf", SP: "pe",
  SU: "uy", SV: "ve", SY: "gy", DA: "dz", DB: "bj", DF: "bf", DG: "gh", DI: "ci", DN: "ng",
  DR: "ne", DT: "tn", DX: "tg", FA: "za", FB: "bw", FC: "cg", FD: "sz", FE: "cf", FG: "gq",
  FH: "sh", FI: "mu", FJ: "io", FK: "cm", FL: "zm", FM: "mg", FN: "ao", FO: "ga", FP: "st",
  FQ: "mz", FS: "sc", FT: "td", FV: "zw", FW: "mw", FX: "ls", FY: "na", FZ: "cd", GA: "ml",
  GB: "gm", GC: "ic", GE: "ea", GF: "sl", GG: "gw", GL: "lr", GM: "ma", GO: "sn", GQ: "mr",
  GS: "eh", GU: "gn", GV: "cv", HA: "et", HB: "bi", HC: "so", HD: "dj", HE: "eg", HH: "er",
  HK: "ke", HL: "ly", HR: "rw", HS: "sd", HT: "tz", HU: "ug", OA: "af", OB: "bh", OE: "sa",
  OI: "ir", OJ: "jd", OK: "kw", OL: "lb", OM: "ae", OO: "om", OP: "pk", OR: "iq", OS: "sy",
  OT: "qa", OY: "ye", VA: "in", VC: "lk", VD: "kh", VE: "in", VG: "bd", VH: "hk", VI: "in",
  VL: "la", VM: "mo", VN: "np", VO: "in", VQ: "bt", VR: "mv", VT: "th", VV: "vn", VY: "mm",
  RC: "tw", RJ: "jp", RK: "kr", RO: "jp", RP: "ph", Z: "cn", ZB: "cn", ZG: "cn", ZH: "cn",
  ZJ: "cn", ZL: "cn", ZM: "mn", ZP: "cn", ZS: "cn", ZU: "cn", ZW: "cn", ZY: "cn", ZK: "kp",
  UA: "kz", UB: "az", UC: "kg", UD: "am", UG: "ge", UT: "uz", WA: "id", WB: "my", WI: "id",
  WM: "my", WP: "tl", WQ: "id", WR: "id", WS: "sg", YB: "au", YM: "au", YS: "au", NZ: "nz",
  NF: "fj", NG: "tv", NI: "nu", NL: "wf", NS: "ws", NT: "pf", NV: "vu", NW: "nc", AG: "sb",
  AN: "nr", AY: "pg", SC_: "cl"
};

function CountriesCard({ data }: PropsData) {
  // Mapujemy bezpośrednio całą tablicę z danymi bez ucinania jej przez .slice
  return (
    <div className="panel rounded-xl p-5">
      <div className="mb-3 flex items-center gap-2">
        <MapPin className="h-4 w-4 text-instrument" />
        <h3 className="font-display text-lg font-semibold">Countries Visited</h3>
      </div>
      <div className="font-display text-5xl font-semibold">{data.countries.length}</div>
      <div className="mono mt-1 text-[10px] uppercase tracking-widest text-muted-foreground">
        Unique ICAO regions
      </div>
      {data.countries.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {data.countries.map((c) => (
            <span
              key={c.code}
              className="mono inline-flex items-center gap-1.5 rounded bg-secondary px-2 py-1 text-[11px] ring-1 ring-border"
              title={`${c.name} · ${c.visits} visits`}
            >
              <span className="font-semibold text-foreground">{c.code}</span>
              <span className="text-muted-foreground flex items-center gap-1.5">
             <img
                src={`https://netlify.app{encodeURIComponent(c.name.toLowerCase())}.png`}
                alt={`${c.name} flag`}
                className="h-3 w-4.5 rounded-sm object-cover inline-block border border-border/40 shadow-sm"
                onError={(e) => {
                  // Jeśli jakieś nietypowe małe terytorium nie zostanie dopasowane, ukrywamy ikonę błędu
                  e.currentTarget.style.display = 'none';
                }}
              />

                <span>{c.name}</span>
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}


function MostVisitedCard({ data }: PropsData) {
  const rows = data.topAirports;
  const max = rows[0]?.visits ?? 1;
  return (
    <div className="panel rounded-xl p-5">
      <div className="mb-3 flex items-center gap-2">
        <Award className="h-4 w-4 text-runway" />
        <h3 className="font-display text-lg font-semibold">Most Visited Airports</h3>
      </div>
      {rows.length === 0 ? (
        <div className="text-sm text-muted-foreground">No airport visits recorded yet.</div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.icao} className="flex items-center gap-3">
              <span className="mono w-14 shrink-0 text-sm font-semibold">{r.icao}</span>
              <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-runway/80"
                  style={{ width: `${Math.max(4, (r.visits / max) * 100)}%` }}
                />
              </div>
              <span className="mono w-16 shrink-0 text-right text-xs text-muted-foreground">
                {r.visits} {r.visits === 1 ? "visit" : "visits"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
function LongestFlightCard({ data }: PropsData) {
  const f = data.longestFlight;
  
  // OTO LINIA DIAGNOSTYCZNA – WPISZ JĄ TUTAJ:
  console.log("=== DIAGNOSTYKA REKORDU ===", f);
  
  return (
    <div className="panel rounded-xl p-5">
      <div className="mb-3 flex items-center gap-2">
        <Ruler className="h-4 w-4 text-instrument" />
        <h3 className="font-display text-lg font-semibold">Longest Flight</h3>
      </div>
      {!f ? (
        <div className="text-sm text-muted-foreground">No distance data available yet.</div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div>
              <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">From</div>
              <div className="font-display text-2xl font-semibold">{f.departureIcao ?? "—"}</div>
            </div>
            <Plane className="h-4 w-4 -rotate-45 text-runway" />
            <div>
              <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">To</div>
              <div className="font-display text-2xl font-semibold">{f.destinationIcao ?? "—"}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg border border-border/60 bg-background/40 p-3">
              <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Distance</div>
              <div className="font-display text-xl font-semibold text-runway">
                {formatNumber(f.distanceNm)} <span className="text-xs text-muted-foreground">NM</span>
              </div>
            </div>
            <div className="rounded-lg border border-border/60 bg-background/40 p-3">
              <div className="mono text-[10px] uppercase tracking-widest text-muted-foreground">Aircraft</div>
              <div className="truncate font-display text-base font-semibold" title={f.aircraft ?? undefined}>
                {f.aircraft ?? f.aircraftIcao ?? "—"}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function TierDistributionCard({ data }: PropsData) {
  const rows = data.tierDistribution;
  const total = rows.reduce((s, r) => s + r.flights, 0);
  return (
    <div className="panel rounded-xl p-5 lg:col-span-2">
      <div className="mb-3 flex items-center gap-2">
        <Plane className="h-4 w-4 text-runway" />
        <h3 className="font-display text-lg font-semibold">Aircraft Tier Distribution</h3>
      </div>
      {rows.length === 0 ? (
        <div className="text-sm text-muted-foreground">No aircraft data available yet.</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="h-64 w-full">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={rows}
                  dataKey="flights"
                  nameKey="label"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={2}
                  stroke="var(--background)"
                >
                  {rows.map((r, i) => (
                    <Cell key={r.label} fill={TIER_COLORS[r.tier === 0 ? 6 : (r.tier - 1) % 6]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                  formatter={(v: number, name: string) => [`${formatNumber(v)} flights`, name]}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="space-y-2 self-center">
            {rows.map((r) => {
              const pct = total > 0 ? (r.flights / total) * 100 : 0;
              return (
                <li key={r.label} className="flex items-center gap-3">
                  <span
                    className="h-3 w-3 shrink-0 rounded"
                    style={{ background: TIER_COLORS[r.tier === 0 ? 6 : (r.tier - 1) % 6] }}
                  />
                  <span className="mono w-20 shrink-0 text-sm font-semibold">{r.label}</span>
                  <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-runway/70"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="mono w-24 shrink-0 text-right text-xs text-muted-foreground">
                    {pct.toFixed(1)}% · {r.flights}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}


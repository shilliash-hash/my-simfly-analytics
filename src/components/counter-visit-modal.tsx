import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSimflyPayload } from "@/lib/simfly.functions";
import { X, Building2, Loader2, ExternalLink } from "lucide-react";
import { Link } from "@tanstack/react-router";

type CounterVisitModalProps = {
  username: string;
  onClose: () => void;
};

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
  GB: "gm", GC: "ic", GE: "ea", GF: "sl", GG: "gwan", GL: "lr", GM: "ma", GO: "sn", GQ: "mr",
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

function getEmojiFlag(icaoCode: string): string {
  const iso = (ICAO_TO_ISO[icaoCode.toUpperCase().slice(0, 2)] || icaoCode.slice(0, 2)).toLowerCase();
  if (iso === "us") return "🇺🇸";
  if (iso === "de") return "🇩🇪";
  if (iso === "gb") return "🇬🇧";
  const codePoints = iso.toUpperCase().split("").map(char => 127397 + char.charCodeAt(0));
  try { return String.fromCodePoint(...codePoints); } catch { return "🌐"; }
}

export function CounterVisitModal({ username, onClose }: CounterVisitModalProps) {
  const fetchPayload = useServerFn(getSimflyPayload);

  const { data, isLoading } = useQuery({
    queryKey: ["simfly", "pilot-hubs", username],
    queryFn: () => fetchPayload({ data: { username } }),
    staleTime: 60_000,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="panel w-full max-w-md rounded-xl p-5 border border-border shadow-2xl bg-popover text-popover-foreground relative">
        <div className="flex items-center justify-between border-b border-border pb-3 mb-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-runway" />
            <h3 className="font-display font-semibold text-base">
              Counter-Visit: @{username}'s Hubs
            </h3>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 transition rounded-md hover:bg-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-runway" />
            <span className="mono text-xs uppercase tracking-widest text-muted-foreground">Scanning airports...</span>
          </div>
        ) : !data?.airports || data.airports.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-6">No active hubs found for this pilot.</div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground leading-relaxed mb-1">
              Select one of their owned hubs to inspect it and plan your return flight:
            </p>
            <div className="overflow-y-auto max-h-64 space-y-2 pr-1 custom-scrollbar">
              {data.airports.map((airport: any) => (
                <Link
                  key={airport.icao}
                  to="/airports/$id"
                  params={{ id: airport.icao }}
                  onClick={onClose}
                  className="flex items-center justify-between border border-border/40 bg-background/40 p-2.5 rounded-lg hover:border-runway/40 transition group text-left block"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="mono text-xs font-bold text-runway bg-runway/5 px-1.5 py-0.5 rounded border border-runway/10">
                        {airport.icao}
                      </span>
                      <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                        <span>{getEmojiFlag(airport.icao)}</span>
                        <span>{airport.country || "—"}</span>
                      </span>
                    </div>
                    <div className="font-display mt-1 text-sm font-medium truncate pr-2 text-foreground/90 group-hover:text-runway transition-colors">
                      {airport.name}
                    </div>
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground group-hover:text-runway opacity-0 group-hover:opacity-100 transition" />
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

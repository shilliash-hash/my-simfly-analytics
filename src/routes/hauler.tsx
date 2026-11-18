import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ArrowRightLeft, CircleHelp, Home, Plane, RefreshCw, Search, Users } from "lucide-react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { HubCoin } from "@/components/hub-coin";
import { getHaulerBoard, getHaulerDistance, syncHaulerFlights } from "@/lib/hauler.functions";
import { charterSurcharge, operationalCost, predictHaul } from "@/lib/hauler-rules";
import { useSimflyArgs } from "@/lib/viewed-user";
import { cn } from "@/lib/utils";

export const Route=createFileRoute("/hauler")({component:HaulerPage,head:()=>({meta:[
  {title:"Hub Hauler — SimFly Passenger Network"},
  {name:"description",content:"Plan community passenger transfers, compare Hub-coin earnings and balance PAX stocks across player airports."},
  {property:"og:title",content:"Hub Hauler — SimFly Passenger Network"},
  {property:"og:description",content:"A living passenger network with flight forecasts, operating costs and verified Hub-coin earnings."},
  {property:"og:type",content:"website"},{name:"twitter:card",content:"summary"},
]})});
type Board=Awaited<ReturnType<typeof getHaulerBoard>>;
const coins=(n:number)=>n.toLocaleString("en-GB",{minimumFractionDigits:1,maximumFractionDigits:1});

function HaulerPage(){
  const args=useSimflyArgs();
  const pilot=args.username??"";
  const fetchBoard=useServerFn(getHaulerBoard),fetchDistance=useServerFn(getHaulerDistance);
  const q=useQuery({queryKey:["hauler",args.keyTag],queryFn:()=>fetchBoard(),refetchInterval:60000});
  const runSync=useServerFn(syncHaulerFlights);
  const [tab,setTab]=useState("network");
  const lastSync=useRef(0);
  const sync=useMutation({mutationFn:()=>runSync(),onSettled:()=>{void q.refetch();}});
  const triggerSync=useCallback((force=false)=>{
    if(sync.isPending) return;
    if(!force&&Date.now()-lastSync.current<45_000) return;
    lastSync.current=Date.now();sync.mutate();
  },[sync]);
  useEffect(()=>{
    if(tab!=="flights") return;
    const t=setTimeout(()=>triggerSync(),400);
    const i=setInterval(()=>triggerSync(),180_000);
    return ()=>{clearTimeout(t);clearInterval(i);};
  },[tab]); // eslint-disable-line react-hooks/exhaustive-deps
  const [mainHub,setMainHub]=useState("");
  const [origin,setOrigin]=useState("");const [destination,setDestination]=useState("");const [aircraft,setAircraft]=useState("");
  const [search,setSearch]=useState("");const [ownOnly,setOwnOnly]=useState(false);
  const board=q.data;
  const mine=(board?.airports??[]).filter(a=>pilot && a.owner_username.toLowerCase()===pilot.toLowerCase());
  useEffect(()=>{setMainHub(pilot?localStorage.getItem(`hauler:main-hub:${pilot.toLowerCase()}`)??"":"");},[pilot]);
  const nominate=(icao:string)=>{setMainHub(icao); if(pilot) localStorage.setItem(`hauler:main-hub:${pilot.toLowerCase()}`,icao); if(!origin)setOrigin(icao);};
  const from=board?.airports.find(a=>a.icao===origin),to=board?.airports.find(a=>a.icao===destination),plane=board?.aircraft.find(p=>p.slug===aircraft);
  const distance=useQuery({queryKey:["hauler-distance",args.keyTag,origin,destination],queryFn:()=>fetchDistance({data:{origin,destination}}),enabled:!!from&&!!to&&origin!==destination,staleTime:86400000});
  const nm=distance.data?.distanceNm;
  const forecast=from&&to&&plane&&nm!=null&&origin!==destination?predictHaul({stock:from.current_pax,seats:plane.seats,destinationStock:to.current_pax,destinationCapacity:to.capacity,tier:plane.tier,distanceNm:nm}):null;
  const personal=(board?.flights??[]).filter(f=>pilot&&f.pilot_username.toLowerCase()===pilot.toLowerCase());
  const completed=personal.filter(f=>f.status==="completed");
  const ownerRows=(board?.flights??[]).filter(f=>f.status==="completed"&&pilot&&(f.origin_owner.toLowerCase()===pilot.toLowerCase()||f.destination_owner.toLowerCase()===pilot.toLowerCase()));
  const handling=ownerRows.reduce((sum,f)=>sum+(f.origin_owner.toLowerCase()===pilot.toLowerCase()?f.origin_fee:0)+(f.destination_owner.toLowerCase()===pilot.toLowerCase()?f.destination_fee:0),0);
  const earnings=completed.reduce((sum,f)=>sum+f.net,0);
  const shown=useMemo(()=>(board?.airports??[]).filter(a=>(!ownOnly||a.owner_username.toLowerCase()===pilot.toLowerCase())&&(`${a.icao} ${a.name} ${a.owner_username}`).toLowerCase().includes(search.toLowerCase())),[board,ownOnly,pilot,search]);
  const selectAirport=(icao:string)=>{if(!origin)setOrigin(icao);else if(icao!==origin)setDestination(icao);};
  return <AppShell>
    <PageHeader eyebrow="Community passenger operations" title="Hub Hauler" actions={<><Rules/><Button size="icon" variant="outline" aria-label="Refresh Hauler" title="Refresh Hauler" onClick={()=>{triggerSync(true);void q.refetch();}} disabled={q.isFetching||sync.isPending}><RefreshCw className={cn("h-4 w-4",(q.isFetching||sync.isPending)&&"animate-spin motion-reduce:animate-none")}/></Button></>}/>
    {q.isError&&<div role="alert" className="mb-4 border-l-2 border-destructive pl-3 text-sm text-destructive">Passenger network unavailable. <Button variant="link" onClick={()=>void q.refetch()}>Retry</Button></div>}
    <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Metric label="Hub-coin balance"><HubCoin/>{pilot?coins(earnings+handling):"—"}</Metric>
      <Metric label="PAX delivered"><Users className="h-5 w-5 text-runway"/>{pilot?completed.reduce((n,f)=>n+f.accepted,0).toLocaleString():"—"}</Metric>
      <Metric label="Owner handling"><HubCoin/>{pilot?coins(handling):"—"}</Metric>
      <Metric label="Network airports"><Home className="h-5 w-5 text-runway"/>{board?.airports.length??"—"}</Metric>
    </div>
    <section className="mb-6 flex flex-wrap items-center justify-between gap-3 border-y border-border py-4">
      <div className="flex items-center gap-3"><Home className="h-5 w-5 text-runway"/><div><p className="text-xs text-muted-foreground">Main Hub {pilot&&`· @${pilot}`}</p><p className="font-mono text-lg">{mine.some(a=>a.icao===mainHub)?mainHub:"Not nominated"}</p></div></div>
      <label className="flex items-center gap-2 text-sm"><span className="text-muted-foreground">Nominate</span><select aria-label="Nominate Main Hub" className="max-w-[240px] rounded-md border border-input bg-background p-2 text-sm" value={mine.some(a=>a.icao===mainHub)?mainHub:""} onChange={e=>nominate(e.target.value)} disabled={!mine.length}><option value="">{pilot?"Choose your airport":"Select a pilot in Overview"}</option>{mine.map(a=><option key={a.icao} value={a.icao}>{a.icao} · {a.name}</option>)}</select></label>
    </section>
    <section className="mb-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="min-w-0"><h2 className="mb-4 flex items-center gap-2 text-lg font-semibold"><Plane className="h-5 w-5 text-runway"/>Flight planner</h2>
        <div className="grid grid-cols-[minmax(0,1fr)_32px_minmax(0,1fr)] items-end gap-2">
          <AirportSelect label="Departure" value={origin} airports={board?.airports??[]} onChange={setOrigin}/>
          <Button size="icon" variant="ghost" aria-label="Swap airports" title="Swap airports" className="h-9 w-8" onClick={()=>{setOrigin(destination);setDestination(origin);}}><ArrowRightLeft className="h-4 w-4"/></Button>
          <AirportSelect label="Arrival" value={destination} airports={board?.airports??[]} onChange={setDestination}/>
        </div>
        <label className="mt-4 block text-xs text-muted-foreground">Aircraft<select aria-label="Aircraft" value={aircraft} onChange={e=>setAircraft(e.target.value)} className="mt-2 w-full rounded-md border border-input bg-background p-2.5 text-sm text-foreground"><option value="">Choose aircraft</option>{(board?.aircraft??[]).map(p=><option key={p.slug} value={p.slug}>{p.name} · T{p.tier} · {p.seats} PAX</option>)}</select></label>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm"><div className="border-l-2 border-runway pl-3"><p className="text-xs text-muted-foreground">Departure stock</p><p className="mt-1 font-mono">{from?Math.floor(from.current_pax).toLocaleString():"—"} PAX</p></div><div className="border-l-2 border-instrument pl-3"><p className="text-xs text-muted-foreground">Arrival headroom · 150%</p><p className="mt-1 font-mono">{to?Math.max(0,Math.floor(to.capacity*1.5-to.current_pax)).toLocaleString():"—"} PAX</p></div></div>
        {origin&&destination&&origin===destination&&<p role="alert" className="mt-3 text-sm text-destructive">Departure and arrival must differ.</p>}
        {distance.isFetching&&<p className="mt-3 text-xs text-muted-foreground">Calculating route distance…</p>}
        {from&&to&&!distance.isFetching&&nm===null&&<p className="mt-3 text-xs text-instrument">Airport coordinates unavailable for this route.</p>}
        {plane&&nm!=null&&plane.range_nm&&nm>plane.range_nm&&<p className="mt-3 text-xs text-instrument">Route exceeds this aircraft’s published range.</p>}
      </div>
      <div className="min-w-0 rounded-lg border border-border bg-secondary/20 p-5" aria-label="Flight prediction">
        <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Flight prediction</h2><span className="font-mono text-xs text-muted-foreground">{forecast?`${nm} NM`:"— NM"}</span></div>
        <div className="mt-4 flex items-center gap-2 font-mono text-xl"><span>{origin||"DEP"}</span><ArrowRight className="h-5 w-5 text-muted-foreground"/><span>{destination||"ARR"}</span></div>
        <div className="my-5 grid grid-cols-3 gap-2"><PredictionNumber label="Boarded" n={forecast?.boarded}/><PredictionNumber label="Paid PAX" n={forecast?.accepted}/><PredictionNumber label="Unpaid PAX" n={forecast?.unpaid} warning/></div>
        <dl className="space-y-2 text-sm"><MoneyRow label="Gross revenue" value={forecast?.gross}/><MoneyRow label={`Operating costs${plane?` · ${operationalCost(plane.tier)*100}%`:""}`} value={forecast?-forecast.costs:undefined}/><div className="flex justify-between text-xs text-muted-foreground"><dt>Charter surcharge</dt><dd>{plane?charterSurcharge(plane.tier)>0?`${charterSurcharge(plane.tier)} HC / paid PAX`:"Not applicable":"—"}</dd></div><MoneyRow label="Handling DEP · 2.5%" value={forecast?-forecast.originFee:undefined}/><MoneyRow label="Handling ARR · 2.5%" value={forecast?-forecast.destinationFee:undefined}/></dl>
        <div className="mt-4 border-t border-border pt-4"><p className="text-xs text-muted-foreground">Expected net earnings</p><p className={cn("mt-2 flex items-center gap-2 font-mono text-3xl",forecast&&forecast.net<0?"text-destructive":"text-runway")}><HubCoin className="h-7 w-7"/>{forecast?coins(forecast.net):"—"}</p></div>
        {forecast&&forecast.unpaid>0&&<p role="alert" className="mt-4 border-l-2 border-instrument pl-3 text-xs text-instrument">{forecast.unpaid} passengers exceed the arrival capacity and earn no revenue. Operating costs still cover all {forecast.boarded} passengers.</p>}
        {forecast&&forecast.boarded===0&&<p className="mt-3 text-xs text-instrument">No passengers currently available at departure.</p>}
        <p className="mt-3 text-[11px] text-muted-foreground">Estimate at current stocks. Actual arrivals may differ; settlement requires a successful SimFly flight.</p>
      </div>
    </section>
    <Tabs value={tab} onValueChange={setTab}><TabsList className="mb-4"><TabsTrigger value="network">Airport network</TabsTrigger><TabsTrigger value="flights">Flight ledger</TabsTrigger><TabsTrigger value="income">Income sheet</TabsTrigger><TabsTrigger value="rankings">Rankings</TabsTrigger></TabsList>
      <TabsContent value="network"><div className="mb-4 flex flex-wrap items-center gap-3"><div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"/><Input aria-label="Search network airports" placeholder="ICAO, airport or owner" value={search} onChange={e=>setSearch(e.target.value)} className="pl-9"/></div><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={ownOnly} onChange={e=>setOwnOnly(e.target.checked)}/>My airports</label><span className="text-xs text-muted-foreground">{shown.length} airports</span></div>
        {q.isPending&&<p className="py-8 text-sm text-muted-foreground">Loading passenger network…</p>}
        {!q.isPending&&shown.length===0&&<p className="py-8 text-sm text-muted-foreground">No airports match.</p>}
        <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">{shown.map(a=>{const pct=a.current_pax/a.capacity*100;return <div key={a.icao} className="min-w-0 rounded-lg border border-border bg-secondary/10 p-4"><div className="flex items-center justify-between"><span className="font-mono text-lg font-semibold">{a.icao}{a.icao===mainHub&&<Home className="ml-2 inline h-4 w-4 text-runway"/>}</span><span className="font-mono text-xs text-muted-foreground">T{a.tier} · L{a.level}</span></div><p className="mt-1 truncate text-sm" title={a.name}>{a.name}</p><p className="mt-1 truncate text-xs text-muted-foreground">@{a.owner_username}</p><div className="mb-2 mt-4 flex items-center justify-between text-xs"><span className="font-mono">{Math.floor(a.current_pax).toLocaleString()} / {Math.round(a.capacity).toLocaleString()} PAX</span><span className={pct>100?"text-runway":"text-muted-foreground"}>{pct.toFixed(1)}%</span></div><Progress value={Math.min(100,pct/1.5)} aria-label={`${a.icao} stock, ${pct.toFixed(1)}% of nominal capacity`}/><div className="mt-3 flex items-center justify-between gap-2"><span className={cn("text-xs",pct<20?"text-instrument":"text-muted-foreground")}>{pct>100?"Surplus":pct<20?"Low stock":"Available"}</span><Button size="sm" variant="ghost" onClick={()=>selectAirport(a.icao)}>{origin&&origin!==a.icao?"Set arrival":"Set departure"}<ArrowRight className="ml-1 h-3 w-3"/></Button></div></div>;})}</div>
      </TabsContent>
      <TabsContent value="flights"><SyncStatus pending={sync.isPending} result={sync.data} failed={sync.isError} onSync={()=>triggerSync(true)}/><FlightTable flights={personal.length?personal:board?.flights??[]}/></TabsContent>
      <TabsContent value="income"><div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground"><HubCoin/>@{pilot||"—"} · Hub Hauler only</div><div className="grid gap-3 sm:grid-cols-3"><Metric label="Flight net"><HubCoin/>{coins(earnings)}</Metric><Metric label="Handling fees"><HubCoin/>{coins(handling)}</Metric><Metric label="Total balance"><HubCoin/>{coins(earnings+handling)}</Metric></div><h3 className="mb-3 mt-6 font-semibold">Airport handling</h3><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-border text-xs text-muted-foreground"><tr><th className="py-3">Flight</th><th>Airport</th><th>Handled PAX</th><th>Hub-coins</th></tr></thead><tbody>{ownerRows.flatMap(f=>[{icao:f.origin_icao,owner:f.origin_owner,pax:f.boarded,fee:f.origin_fee},{icao:f.destination_icao,owner:f.destination_owner,pax:f.accepted,fee:f.destination_fee}].filter(r=>r.owner.toLowerCase()===pilot.toLowerCase()).map(r=><tr key={`${f.flight_id}-${r.icao}`} className="border-b border-border/50"><td className="py-3">@{f.pilot_username}</td><td className="font-mono">{r.icao}</td><td>{r.pax}</td><td><HubCoin className="mr-1 h-4 w-4"/>{coins(r.fee)}</td></tr>))}</tbody></table></div>{!ownerRows.length&&<p className="py-5 text-sm text-muted-foreground">No verified handling income yet.</p>}</TabsContent>
      <TabsContent value="rankings"><Rankings flights={board?.flights??[]} pilot={pilot}/></TabsContent>
    </Tabs>
    <p className="mt-6 text-[11px] text-muted-foreground">Last flight check: {board?.worker?.last_completed_at?new Date(board.worker.last_completed_at).toLocaleString("en-GB",{timeZone:"UTC"})+" UTC":"Awaiting first check"}{board?.worker?.error&&` · ${board.worker.error}`}</p>
  </AppShell>;
}
function SyncStatus({pending,result,failed,onSync}:{pending:boolean;result?:{ok:boolean;observed:number;settled:number;skipped:boolean};failed:boolean;onSync:()=>void}){
  const [at,setAt]=useState<string|null>(null);
  useEffect(()=>{if(result)setAt(new Date().toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"}));},[result]);
  const bad=failed||result?.ok===false;
  const text=pending?"Checking SimFly for new flights…":bad?"Flight check unavailable right now. Try again shortly.":result?(result.observed||result.settled?`${result.observed} new · ${result.settled} settled · checked ${at}`:(result.skipped?`Checked moments ago · refreshed ${at}`:`Up to date · checked ${at}`)):"Flights are checked automatically when you open this tab.";
  return <div role="status" aria-live="polite" className="mb-3 flex items-center justify-between gap-3 border-l-2 border-runway/60 pl-3 text-xs">
    <span className={cn("flex items-center gap-2",bad?"text-instrument":"text-muted-foreground")}><RefreshCw className={cn("h-3.5 w-3.5",pending&&"animate-spin text-runway motion-reduce:animate-none")}/>{text}</span>
    <Button size="sm" variant="ghost" onClick={onSync} disabled={pending}>Check now</Button>
  </div>;
}
function Metric({label,children}:{label:string;children:React.ReactNode}){return <div className="min-w-0 rounded-lg border border-border bg-secondary/20 p-4"><p className="text-[11px] uppercase text-muted-foreground">{label}</p><div className="mt-3 flex flex-wrap items-center gap-2 break-all font-mono text-xl">{children}</div></div>;}
function PredictionNumber({label,n,warning}:{label:string;n?:number;warning?:boolean}){return <div><p className="text-[11px] text-muted-foreground">{label}</p><p className={cn("mt-1 font-mono text-2xl",warning&&n?"text-instrument":"text-foreground")}>{n??"—"}</p></div>;}
function MoneyRow({label,value}:{label:string;value?:number}){return <div className="flex items-center justify-between gap-2"><dt>{label}</dt><dd className="flex items-center gap-1 font-mono"><HubCoin className="h-4 w-4"/>{value!=null?coins(value):"—"}</dd></div>;}
function AirportSelect({label,value,airports,onChange}:{label:string;value:string;airports:Board["airports"];onChange:(v:string)=>void}){return <label className="min-w-0 text-xs text-muted-foreground">{label}<select aria-label={label} value={value} onChange={e=>onChange(e.target.value)} className="mt-2 w-full rounded-md border border-input bg-background p-2.5 text-sm text-foreground"><option value="">Select airport</option>{airports.map(a=><option key={a.icao} value={a.icao}>{a.icao} · {a.name}</option>)}</select></label>;}
function FlightTable({flights}:{flights:Board["flights"]}){return <><div className="overflow-x-auto"><table className="w-full whitespace-nowrap text-left text-sm"><thead className="border-b border-border text-xs text-muted-foreground"><tr><th className="py-3 pr-4">Pilot / route</th><th className="pr-4">Aircraft</th><th className="pr-4">Boarded / Paid</th><th className="pr-4">Status</th><th>Net</th></tr></thead><tbody>{flights.map(f=><tr key={f.flight_id} className="border-b border-border/50"><td className="py-3 pr-4"><p>@{f.pilot_username}</p><p className="mt-1 font-mono text-xs text-muted-foreground">{f.origin_icao} → {f.destination_icao}</p></td><td className="pr-4 font-mono">{f.aircraft_icao} · T{f.aircraft_tier}</td><td className="pr-4 font-mono">{f.boarded} / {f.status==="completed"?f.accepted:"—"}</td><td className="pr-4 text-xs">{f.status==="airborne"?"Awaiting verified arrival":f.status==="completed"?"Completed":"Cancelled"}</td><td className={f.net<0?"text-destructive":"text-runway"}><HubCoin className="mr-1 h-4 w-4"/>{f.status==="completed"?coins(f.net):"—"}</td></tr>)}</tbody></table></div>{!flights.length&&<p className="py-6 text-sm text-muted-foreground">No eligible flights observed since the network opened.</p>}</>;}
function Rules(){return <Popover><PopoverTrigger asChild><Button variant="outline" size="icon" aria-label="Hauler rules" title="Hauler rules"><CircleHelp className="h-4 w-4"/></Button></PopoverTrigger><PopoverContent className="max-h-[70vh] w-80 overflow-y-auto text-xs leading-relaxed" align="end"><h3 className="mb-3 text-base font-semibold">Hub Hauler rules</h3><ul className="space-y-3"><li>Airport base capacity, Tier 1–7: 80, 160, 240, 320, 840, 1,660, 2,450 PAX. Each level above 1 adds 10% of its Tier base.</li><li>Starting stock: 10%. Natural regeneration: 1% of nominal capacity per hour up to 100%. Transfers can fill airports to 150%.</li><li>Boarding is limited by departure stock and official SimFly aircraft seats. Only accepted arrival PAX earn revenue.</li><li>Fare per accepted PAX: distance NM ÷ 10, plus a charter surcharge per paid PAX: Tier 1 +12 HC, Tier 2 +10 HC, Tier 3 +8 HC, Tier 4 +6 HC, Tier 5–7 none.</li><li>Costs apply to the potential fare of every boarded passenger, including unpaid overflow: T1–2 25%, T3–4 40%, T5 50%, T6–7 70%. Losses are possible.</li><li>Handling: 2.5% of gross revenue goes to the departure airport owner and 2.5% to the arrival airport owner, deducted from the pilot. Unpaid overflow PAX generate no revenue and no handling.</li><li>Choose a Main Hub from your own airports. This personal browser preference does not alter payments.</li><li>Only Hub pilots on officially observed flights qualify. No retrospective credit for flights before the network opened. Each flight is settled once, after a matching successful SimFly arrival; forecasts never create coins.</li></ul></PopoverContent></Popover>;}
function Rankings({flights,pilot}:{flights:Board["flights"];pilot:string}){
  const me=pilot.toLowerCase();
  const {pilots,airports,total}=useMemo(()=>{
    const P=new Map<string,{name:string;net:number;handling:number;flights:number;pax:number}>();
    const A=new Map<string,{icao:string;owner:string;fees:number;pax:number;ops:number}>();
    const p=(n:string)=>{const k=n.toLowerCase();if(!P.has(k))P.set(k,{name:n,net:0,handling:0,flights:0,pax:0});return P.get(k)!;};
    const a=(i:string,o:string)=>{if(!A.has(i))A.set(i,{icao:i,owner:o,fees:0,pax:0,ops:0});return A.get(i)!;};
    let total={net:0,fees:0,pax:0,flights:0};
    for(const f of flights){if(f.status!=="completed")continue;
      const r=p(f.pilot_username);r.net+=f.net;r.flights++;r.pax+=f.accepted;
      p(f.origin_owner).handling+=f.origin_fee;p(f.destination_owner).handling+=f.destination_fee;
      const o=a(f.origin_icao,f.origin_owner);o.fees+=f.origin_fee;o.pax+=f.boarded;o.ops++;
      const d=a(f.destination_icao,f.destination_owner);d.fees+=f.destination_fee;d.pax+=f.accepted;d.ops++;
      total={net:total.net+f.net,fees:total.fees+f.origin_fee+f.destination_fee,pax:total.pax+f.accepted,flights:total.flights+1};}
    return {pilots:[...P.values()].map(x=>({...x,total:x.net+x.handling})).sort((x,y)=>y.total-x.total),airports:[...A.values()].sort((x,y)=>y.fees-x.fees),total};
  },[flights]);
  const myRank=pilots.findIndex(x=>x.name.toLowerCase()===me);
  return <>
    <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Metric label="Network flights">{total.flights.toLocaleString()}</Metric>
      <Metric label="PAX delivered">{total.pax.toLocaleString()}</Metric>
      <Metric label="Pilot earnings"><HubCoin/>{coins(total.net)}</Metric>
      <Metric label="Your rank">{myRank>=0?`#${myRank+1} / ${pilots.length}`:"—"}</Metric>
    </div>
    {!total.flights&&<p className="py-6 text-sm text-muted-foreground">No settled flights yet. Rankings appear after the first verified arrival.</p>}
    {total.flights>0&&<div className="grid gap-6 xl:grid-cols-2">
      <div className="min-w-0"><h3 className="mb-3 font-semibold">Pilot leaderboard</h3><div className="overflow-x-auto"><table className="w-full whitespace-nowrap text-left text-sm"><thead className="border-b border-border text-xs text-muted-foreground"><tr><th className="py-3 pr-3">#</th><th className="pr-3">Pilot</th><th className="pr-3">Flights</th><th className="pr-3">PAX</th><th className="pr-3">Flight net</th><th className="pr-3">Handling</th><th>Total</th></tr></thead><tbody>{pilots.map((x,i)=><tr key={x.name} className={cn("border-b border-border/50",x.name.toLowerCase()===me&&"bg-runway/10")}><td className="py-2.5 pr-3 font-mono text-muted-foreground">{i+1}</td><td className="pr-3">@{x.name}</td><td className="pr-3 font-mono">{x.flights}</td><td className="pr-3 font-mono">{x.pax}</td><td className="pr-3 font-mono">{coins(x.net)}</td><td className="pr-3 font-mono">{coins(x.handling)}</td><td className="font-mono text-runway"><HubCoin className="mr-1 h-4 w-4"/>{coins(x.total)}</td></tr>)}</tbody></table></div></div>
      <div className="min-w-0"><h3 className="mb-3 font-semibold">Top airport hubs</h3><div className="overflow-x-auto"><table className="w-full whitespace-nowrap text-left text-sm"><thead className="border-b border-border text-xs text-muted-foreground"><tr><th className="py-3 pr-3">#</th><th className="pr-3">Airport</th><th className="pr-3">Owner</th><th className="pr-3">Movements</th><th className="pr-3">PAX handled</th><th>Handling</th></tr></thead><tbody>{airports.map((x,i)=><tr key={x.icao} className={cn("border-b border-border/50",x.owner.toLowerCase()===me&&"bg-runway/10")}><td className="py-2.5 pr-3 font-mono text-muted-foreground">{i+1}</td><td className="pr-3 font-mono">{x.icao}</td><td className="pr-3">@{x.owner}</td><td className="pr-3 font-mono">{x.ops}</td><td className="pr-3 font-mono">{x.pax}</td><td className="font-mono text-instrument"><HubCoin className="mr-1 h-4 w-4"/>{coins(x.fees)}</td></tr>)}</tbody></table></div></div>
    </div>}
  </>;
}

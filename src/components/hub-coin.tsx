import { cn } from "@/lib/utils";
export function HubCoin({className}:{className?:string}) {
  return <svg viewBox="0 0 24 24" className={cn("inline-block h-5 w-5 shrink-0 text-instrument",className)} role="img" aria-label="Hub-coin"><circle cx="12" cy="12" r="10" fill="currentColor" fillOpacity=".12" stroke="currentColor" strokeWidth="1.5"/><circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" strokeWidth=".5"/><path d="M9 7v10M15 7v10M9 12h6" fill="none" stroke="currentColor" strokeWidth="1.8"/></svg>;
}

import { PlaneTakeoff } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { simbriefDispatchUrl } from "@/lib/simbrief";
interface SimbriefLinkProps {
  icao: string;
  children?: ReactNode;
  className?: string;
  showIcon?: boolean;
}
/**
 * Minimal quick-dispatch anchor that opens SimBrief with the given ICAO as destination.
 * Falls back to a plain span when the ICAO is not valid, so callers can drop it in safely.
 */
export function SimbriefLink({ icao, children, className, showIcon = false }: SimbriefLinkProps) {
  const href = simbriefDispatchUrl(icao);
  const label = children ?? icao;
  if (!href) {
    return <span className={className}>{label}</span>;
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title="✈ Plan flight with SimBrief"
      aria-label={`Plan flight to ${icao.toUpperCase()} with SimBrief`}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => e.stopPropagation()}
      className={cn(
        "inline-flex items-center gap-1 cursor-pointer transition-colors",
        "hover:text-runway hover:underline decoration-dotted underline-offset-2",
        className,
      )}
    >
      {label}
      {showIcon && <PlaneTakeoff className="h-3 w-3 opacity-70" aria-hidden />}
    </a>
  );
}

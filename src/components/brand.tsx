import { cn } from "@/lib/cn";

/**
 * Ijara mark: an arched doorway (the letting) holding a brass pillar (the Arabic letter alif, the first letter
 * of the name). Original, geometric, readable at 16px and printable in one colour.
 */
export function LogoMark({ className, tone = "color" }: { className?: string; tone?: "color" | "mono-light" | "mono-dark" }) {
  const tile = tone === "color" ? "#0f3d3a" : tone === "mono-light" ? "#ffffff" : "#0f3d3a";
  const door = tone === "color" ? "#f4efe4" : tone === "mono-light" ? "#0f3d3a" : "#ffffff";
  const pillar = tone === "color" ? "#b8893b" : tone === "mono-light" ? "#ffffff" : "#0f3d3a";
  return (
    <svg viewBox="0 0 64 64" className={cn("size-8", className)} role="img" aria-label="Ijara" xmlns="http://www.w3.org/2000/svg">
      <rect width="64" height="64" rx="14" fill={tile} />
      <path d="M19 49V31a13 13 0 0 1 26 0v18Z" fill={door} />
      <rect x="29.25" y="26" width="5.5" height="23" rx="1" fill={pillar} />
      <rect x="14" y="49" width="36" height="3.5" rx="1.75" fill={door} opacity={tone === "color" ? 0.9 : 1} />
    </svg>
  );
}

export function Wordmark({ className, inverse, locale = "en" }: { className?: string; inverse?: boolean; locale?: "en" | "ar" }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className={cn("text-[19px] font-semibold leading-none tracking-tight", inverse ? "text-white" : "text-brand-900", locale === "ar" && "text-[22px] tracking-normal")}>
        {locale === "ar" ? "إجارة" : "Ijara"}
      </span>
    </span>
  );
}

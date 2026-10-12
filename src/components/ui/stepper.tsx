import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export interface Step {
  key: string;
  label: ReactNode;
  at?: ReactNode;
}

/**
 * Visual state machine: shows where an entity is in its lifecycle (unit, maintenance request, cheque).
 * Horizontal on wide screens, a compact vertical list on phones.
 */
export function Stepper({
  steps,
  current,
  tone = "brand",
  warnAt,
}: {
  steps: Step[];
  current: string;
  tone?: "brand" | "bad";
  /** A step that is the current one but needs attention (for example bounced). */
  warnAt?: string;
}) {
  const idx = Math.max(0, steps.findIndex((s) => s.key === current));
  return (
    <ol className="grid gap-0 md:grid-flow-col md:auto-cols-fr" aria-label="Progress">
      {steps.map((s, i) => {
        const done = i < idx;
        const active = i === idx;
        const warn = active && warnAt === s.key;
        return (
          <li key={s.key} className="relative flex items-start gap-3 pb-4 md:flex-col md:items-center md:gap-2 md:pb-0 md:text-center" aria-current={active ? "step" : undefined}>
            {i < steps.length - 1 ? (
              <>
                <span aria-hidden className={cn("absolute start-[13px] top-7 h-[calc(100%-1.25rem)] w-0.5 md:hidden", done ? "bg-brand-600" : "bg-line")} />
                <span
                  aria-hidden
                  className={cn("absolute top-[13px] hidden h-0.5 md:block", done ? "bg-brand-600" : "bg-line")}
                  style={{ insetInlineStart: "calc(50% + 16px)", insetInlineEnd: "calc(-50% + 16px)" }}
                />
              </>
            ) : null}
            <span
              className={cn(
                "relative z-10 flex size-7 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold ring-4 ring-surface",
                done && "bg-brand-700 text-white",
                active && !warn && (tone === "bad" ? "bg-bad-600 text-white" : "bg-brass-500 text-white"),
                warn && "bg-bad-600 text-white",
                !done && !active && "bg-canvas text-ink-3 ring-1 ring-inset ring-line-strong",
              )}
            >
              {done ? <Check className="size-3.5" aria-hidden /> : i + 1}
            </span>
            <span className="min-w-0 pt-0.5 md:pt-0">
              <span className={cn("block text-[13px] leading-snug", active ? "font-semibold text-ink" : done ? "font-medium text-ink-2" : "text-ink-3")}>{s.label}</span>
              {s.at ? <span className="block text-[12px] text-ink-3">{s.at}</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

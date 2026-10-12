import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";
import { formatAmount } from "@/lib/money";
import type { Locale } from "@/i18n";

/* ---------------------------------- Surfaces --------------------------------- */

export function Card({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("rounded-md border border-line bg-surface shadow-card", className)} {...props} />;
}

export function CardHeader({ title, description, actions, className }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3.5 md:px-5", className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold leading-snug text-ink">{title}</h2>
        {description ? <p className="mt-0.5 text-[13px] text-ink-3">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function CardBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("p-4 md:p-5", className)} {...props} />;
}

/* ----------------------------------- Badges ---------------------------------- */

export type Tone = "neutral" | "brand" | "ok" | "warn" | "bad" | "info" | "brass";

const toneClass: Record<Tone, string> = {
  neutral: "bg-canvas text-ink-2 ring-line-strong",
  brand: "bg-brand-50 text-brand-700 ring-brand-200",
  ok: "bg-ok-50 text-ok-700 ring-ok-100",
  warn: "bg-warn-50 text-warn-700 ring-warn-100",
  bad: "bg-bad-50 text-bad-700 ring-bad-100",
  info: "bg-info-50 text-info-700 ring-info-100",
  brass: "bg-brass-50 text-brass-700 ring-brass-100",
};

export function Badge({ tone = "neutral", children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-xs px-2 py-0.5 text-[12px] font-medium leading-5 ring-1 ring-inset", toneClass[tone], className)}>
      {dot ? <span className="size-1.5 rounded-full bg-current" aria-hidden /> : null}
      {children}
    </span>
  );
}

/* ----------------------------------- Layout ---------------------------------- */

export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  badge,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  breadcrumbs?: { href?: string; label: string }[];
  badge?: ReactNode;
}) {
  return (
    <header className="mb-5 md:mb-6">
      {breadcrumbs && breadcrumbs.length > 0 ? (
        <nav aria-label="Breadcrumb" className="mb-2">
          <ol className="flex flex-wrap items-center gap-1 text-[13px] text-ink-3">
            {breadcrumbs.map((b, i) => (
              <li key={i} className="flex items-center gap-1">
                {i > 0 ? <ChevronRight className="rtl-flip size-3.5 text-line-strong" aria-hidden /> : null}
                {b.href ? (
                  <Link href={b.href} className="hover:text-ink hover:underline">
                    {b.label}
                  </Link>
                ) : (
                  <span aria-current="page">{b.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-ink md:text-[24px]">{title}</h1>
            {badge}
          </div>
          {description ? <p className="mt-1 max-w-3xl text-[14px] text-ink-2">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </header>
  );
}

export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-md border border-dashed border-line-strong bg-surface-2 px-6 py-12 text-center", className)}>
      {icon ? <div className="mb-3 flex size-11 items-center justify-center rounded-md bg-brand-50 text-brand-700">{icon}</div> : null}
      <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      {description ? <p className="mt-1 max-w-md text-[13.5px] text-ink-2">{description}</p> : null}
      {action ? <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone = "neutral",
  href,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "neutral" | "ok" | "warn" | "bad" | "brand";
  href?: string;
  className?: string;
}) {
  const accent = { neutral: "before:bg-line-strong", ok: "before:bg-ok-600", warn: "before:bg-warn-600", bad: "before:bg-bad-600", brand: "before:bg-brand-600" }[tone];
  const inner = (
    <div
      className={cn(
        "relative h-full overflow-hidden rounded-md border border-line bg-surface p-4 shadow-card before:absolute before:inset-y-0 before:start-0 before:w-1",
        accent,
        href && "transition-colors hover:border-line-strong hover:bg-surface-2",
        className,
      )}
    >
      <p className="text-[12.5px] font-medium text-ink-3">{label}</p>
      <p className="mt-1 text-[24px] font-semibold leading-tight tracking-tight text-ink tabular-nums">{value}</p>
      {sub ? <p className="mt-1 text-[12.5px] text-ink-3">{sub}</p> : null}
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full">
      {inner}
    </Link>
  ) : (
    inner
  );
}

export function DefinitionList({ items, className }: { items: { label: ReactNode; value: ReactNode }[]; className?: string }) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-3.5 sm:grid-cols-2", className)}>
      {items.map((it, i) => (
        <div key={i} className="min-w-0">
          <dt className="text-[12.5px] font-medium text-ink-3">{it.label}</dt>
          <dd className="mt-0.5 break-words text-[14px] text-ink">{it.value || <span className="text-ink-3">-</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ------------------------------------ Money ----------------------------------- */

/** OMR amounts always read left to right so digits are never scrambled inside Arabic text. */
export function Money({ baisa, locale = "en", className, strong }: { baisa: number; locale?: Locale; className?: string; strong?: boolean }) {
  return (
    <span className={cn("whitespace-nowrap", strong && "font-semibold", className)}>
      {locale === "ar" ? (
        <>
          <bdi className="ltr-num">{formatAmount(baisa)}</bdi> <span className="text-[0.88em] opacity-80">ر.ع.</span>
        </>
      ) : (
        <>
          <span className="text-[0.88em] opacity-80">OMR</span> <bdi className="ltr-num">{formatAmount(baisa)}</bdi>
        </>
      )}
    </span>
  );
}

export function Num({ children, className }: { children: ReactNode; className?: string }) {
  return <bdi className={cn("ltr-num", className)}>{children}</bdi>;
}

export function ProgressBar({ value, max, tone = "brand", label }: { value: number; max: number; tone?: "brand" | "ok" | "warn" | "bad"; label?: string }) {
  const pct = max <= 0 ? 0 : Math.min(100, Math.round((value / max) * 100));
  const color = { brand: "bg-brand-600", ok: "bg-ok-600", warn: "bg-warn-600", bad: "bg-bad-600" }[tone];
  return (
    <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label} className="h-2 w-full overflow-hidden rounded-full bg-canvas ring-1 ring-inset ring-line">
      <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton h-4", className)} aria-hidden />;
}

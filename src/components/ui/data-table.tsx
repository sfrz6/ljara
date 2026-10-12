import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { Translate } from "@/i18n";
import { buttonClass } from "./button";

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Role on the phone layout: the card title, a subtitle, a value row, or hidden. */
  mobile?: "title" | "subtitle" | "meta" | "hidden" | "badge" | "actions";
  className?: string;
  align?: "start" | "end";
  /** Plain label used on phone cards (defaults to header when it is a string). */
  label?: string;
}

/**
 * Responsive table: a real table from md up, and intentional stacked cards on phones.
 * No horizontal scrolling tables on a 360px screen.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  rowHref,
  rowClassName,
  empty,
  caption,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  rowHref?: (row: T) => string | undefined;
  rowClassName?: (row: T) => string | undefined;
  empty?: ReactNode;
  caption?: string;
}) {
  if (rows.length === 0 && empty) return <>{empty}</>;
  const title = columns.find((c) => c.mobile === "title") ?? columns[0];
  const subtitle = columns.find((c) => c.mobile === "subtitle");
  const badge = columns.find((c) => c.mobile === "badge");
  const actions = columns.find((c) => c.mobile === "actions");
  const meta = columns.filter((c) => c.mobile === "meta" || (c.mobile === undefined && c !== title && c !== subtitle && c !== badge && c !== actions));

  return (
    <>
      <div className="hidden overflow-hidden rounded-md border border-line bg-surface shadow-card md:block">
        <div className="scroll-x">
          <table className="w-full border-collapse text-[14px]">
            {caption ? <caption className="sr-only">{caption}</caption> : null}
            <thead>
              <tr className="border-b border-line bg-surface-2 text-[12px] font-semibold uppercase tracking-wide text-ink-3">
                {columns.map((c) => (
                  <th key={c.key} scope="col" className={cn("px-4 py-2.5 text-start font-semibold", c.align === "end" && "text-end", c.className)}>
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((row) => {
                const href = rowHref?.(row);
                return (
                  <tr key={rowKey(row)} className={cn("relative transition-colors", href && "hover:bg-surface-2", rowClassName?.(row))}>
                    {columns.map((c, i) => (
                      <td key={c.key} className={cn("px-4 py-3 align-middle", c.align === "end" && "text-end", c.className)}>
                        {href && i === 0 ? (
                          <Link href={href} className="font-medium text-ink after:absolute after:inset-0 hover:text-brand-700 hover:underline">
                            {c.cell(row)}
                          </Link>
                        ) : (
                          c.cell(row)
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <ul className="space-y-2.5 md:hidden" role="list">
        {rows.map((row) => {
          const href = rowHref?.(row);
          const body = (
            <div className={cn("rounded-md border border-line bg-surface p-3.5 shadow-card", href && "active:bg-surface-2", rowClassName?.(row))}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-semibold leading-snug text-ink">{title.cell(row)}</div>
                  {subtitle ? <div className="mt-0.5 text-[13px] text-ink-2">{subtitle.cell(row)}</div> : null}
                </div>
                {badge ? <div className="shrink-0">{badge.cell(row)}</div> : null}
                {href ? <ChevronRight className="rtl-flip mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden /> : null}
              </div>
              {meta.length > 0 ? (
                <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-line pt-2.5">
                  {meta.map((c) => (
                    <div key={c.key} className="min-w-0">
                      <dt className="text-[11.5px] font-medium text-ink-3">{c.label ?? (typeof c.header === "string" ? c.header : "")}</dt>
                      <dd className="break-words text-[13.5px] text-ink">{c.cell(row)}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {actions ? <div className="mt-3 border-t border-line pt-3">{actions.cell(row)}</div> : null}
            </div>
          );
          return (
            <li key={rowKey(row)}>
              {href ? (
                <Link href={href} className="block">
                  {body}
                </Link>
              ) : (
                body
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}

/* -------------------------------- Pagination -------------------------------- */

export function Pagination({
  page,
  pageSize,
  total,
  params,
  basePath,
  t,
}: {
  page: number;
  pageSize: number;
  total: number;
  params: Record<string, string | undefined>;
  basePath: string;
  t: Translate;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v && k !== "page") sp.set(k, v);
    if (p > 1) sp.set("page", String(p));
    const qs = sp.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav className="mt-4 flex items-center justify-between gap-3" aria-label="Pagination">
      <p className="text-[13px] text-ink-3">
        <bdi className="ltr-num">{t("common.showing", { from, to, total })}</bdi>
      </p>
      <div className="flex items-center gap-2">
        <Link
          href={href(page - 1)}
          aria-disabled={page <= 1}
          className={buttonClass("secondary", "sm", page <= 1 ? "pointer-events-none opacity-50" : "")}
          scroll={false}
        >
          <ChevronLeft className="rtl-flip size-4" aria-hidden />
          <span className="max-sm:sr-only">{t("common.previous")}</span>
        </Link>
        <span className="text-[13px] text-ink-2">
          <bdi className="ltr-num">{t("common.page_of", { page, pages })}</bdi>
        </span>
        <Link
          href={href(page + 1)}
          aria-disabled={page >= pages}
          className={buttonClass("secondary", "sm", page >= pages ? "pointer-events-none opacity-50" : "")}
          scroll={false}
        >
          <span className="max-sm:sr-only">{t("common.next")}</span>
          <ChevronRight className="rtl-flip size-4" aria-hidden />
        </Link>
      </div>
    </nav>
  );
}

export function parsePage(value: string | undefined): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

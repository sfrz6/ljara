"use client";

import { useRef, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "./button";
import { controlClass } from "./form";
import { cn } from "@/lib/cn";
import { useI18n } from "../i18n-provider";

/**
 * Filter bar driven entirely by the URL, so results are server rendered, shareable and back-button friendly.
 * On phones the filters sit behind a single "Filters" button instead of a wall of controls.
 */
export function FilterBar({
  searchPlaceholder,
  filters,
  hasActive,
  defaultQuery,
  dates,
}: {
  searchPlaceholder?: string;
  filters?: { name: string; label: string; options: { value: string; label: string }[]; value?: string }[];
  hasActive?: boolean;
  defaultQuery?: string;
  dates?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const formRef = useRef<HTMLFormElement>(null);
  const { t } = useI18n();

  function submit() {
    const fd = new FormData(formRef.current!);
    const sp = new URLSearchParams();
    for (const [k, v] of fd.entries()) if (typeof v === "string" && v.trim()) sp.set(k, v.trim());
    const qs = sp.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  const control = (f: NonNullable<typeof filters>[number]) => (
    <label key={f.name} className="block min-w-0">
      <span className="mb-1 block text-[12px] font-medium text-ink-3">{f.label}</span>
      <select name={f.name} defaultValue={params.get(f.name) ?? f.value ?? ""} onChange={submit} className={cn(controlClass, "md:w-44")}>
        <option value="">{t("common.all")}</option>
        {f.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <form
      ref={formRef}
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="mb-4 flex flex-col gap-3 md:flex-row md:items-end"
    >
      {searchPlaceholder ? (
        <label className="relative block flex-1 md:max-w-sm">
          <span className="sr-only">{t("common.search")}</span>
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
          <input name="q" type="search" defaultValue={defaultQuery ?? params.get("q") ?? ""} placeholder={searchPlaceholder} className={cn(controlClass, "ps-9")} enterKeyHint="search" />
        </label>
      ) : null}
      {dates ? (
        <div className="grid grid-cols-2 gap-3 md:flex md:items-end">
          {([["from", t("common.date_from")], ["to", t("common.date_to")]] as const).map(([n, l]) => (
            <label key={n} className="block min-w-0"><span className="mb-1 block text-[12px] font-medium text-ink-3">{l}</span><input type="date" name={n} defaultValue={params.get(n) ?? ""} onChange={submit} className={cn(controlClass, "md:w-40")} /></label>
          ))}
        </div>
      ) : null}
      {filters && filters.length > 0 ? (
        <>
          <details className="group md:hidden">
            <summary className="flex h-11 cursor-pointer list-none items-center justify-between rounded-sm border border-line-strong bg-surface px-3 text-[14px] font-medium text-ink-2 [&::-webkit-details-marker]:hidden">
              <span className="flex items-center gap-2">
                <SlidersHorizontal className="size-4" aria-hidden />
                {t("common.filters")}
              </span>
              {hasActive ? <span className="size-2 rounded-full bg-brass-500" aria-hidden /> : null}
            </summary>
            <div className="mt-2 grid grid-cols-1 gap-3 rounded-md border border-line bg-surface p-3">{filters.map(control)}</div>
          </details>
          <div className="hidden items-end gap-3 md:flex">{filters.map(control)}</div>
        </>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" variant="secondary" className="max-md:flex-1">
          {t("common.apply")}
        </Button>
        {hasActive ? (
          <Button variant="ghost" onClick={() => router.replace(pathname, { scroll: false })} className="max-md:flex-1">
            <X className="size-4" aria-hidden />
            {t("common.clear")}
          </Button>
        ) : null}
      </div>
    </form>
  );
}

export function Tabs({ tabs, active, basePath, param = "tab" }: { tabs: { value: string; label: ReactNode; count?: number; tone?: "bad" | "warn" }[]; active: string; basePath: string; param?: string }) {
  return (
    <div className="scroll-x -mx-4 mb-4 border-b border-line px-4 md:mx-0 md:px-0" role="tablist">
      <div className="flex min-w-max gap-1">
        {tabs.map((tab) => {
          const selected = tab.value === active;
          return (
            <a
              key={tab.value}
              role="tab"
              aria-selected={selected}
              href={`${basePath}${tab.value ? `?${param}=${tab.value}` : ""}`}
              className={cn(
                "relative flex items-center gap-2 whitespace-nowrap px-3.5 py-2.5 text-[14px] font-medium transition-colors",
                selected ? "text-brand-800 after:absolute after:inset-x-0 after:bottom-[-1px] after:h-0.5 after:bg-brand-700" : "text-ink-3 hover:text-ink",
              )}
            >
              {tab.label}
              {tab.count !== undefined ? (
                <span className={cn("min-w-5 rounded-xs px-1.5 text-center text-[12px] leading-5 tabular-nums", tab.tone === "bad" && tab.count > 0 ? "bg-bad-600 text-white" : tab.tone === "warn" && tab.count > 0 ? "bg-warn-100 text-warn-700" : "bg-canvas text-ink-2")}>
                  {tab.count}
                </span>
              ) : null}
            </a>
          );
        })}
      </div>
    </div>
  );
}

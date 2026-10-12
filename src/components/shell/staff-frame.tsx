"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog, Popover } from "radix-ui";
import {
  BarChart3, Bell, Building2, ClipboardCheck, FileText, FileUp, Home, KeyRound, LayoutDashboard, LogOut, Menu, Receipt, ScrollText, Search, Settings, ShieldCheck, Users, Wallet, Wrench, X, Building,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { Wordmark } from "../brand";
import { useI18n } from "../i18n-provider";
import { signOutAction, markNotificationsReadAction, setLocaleAction } from "@/app/actions/common";

const ICONS = { dashboard: LayoutDashboard, owners: Users, buildings: Building2, units: Home, tenants: Users, contracts: FileText, cheques: Wallet, receipts: Receipt, statements: BarChart3, maintenance: Wrench, inspections: ClipboardCheck, imports: FileUp, notifications: Bell, audit: ScrollText, settings: Settings, platform: ShieldCheck, key: KeyRound, building: Building };
export type IconKey = keyof typeof ICONS;

export interface NavItem {
  href: string;
  label: string;
  icon: IconKey;
  badge?: number;
}
export interface NavGroup {
  label?: string;
  items: NavItem[];
}
export interface BellItem {
  id: string;
  subject: string | null;
  body: string;
  link: string | null;
  urgent: boolean;
  unread: boolean;
  at: string;
}

function isActive(pathname: string, href: string) {
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(href + "/"));
}

function NavList({ groups, onNavigate, dark }: { groups: NavGroup[]; onNavigate?: () => void; dark?: boolean }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="space-y-5">
      {groups.map((g, gi) => (
        <div key={gi}>
          {g.label ? <p className={cn("mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider", dark ? "text-white/45" : "text-ink-3")}>{g.label}</p> : null}
          <ul className="space-y-0.5">
            {g.items.map((it) => {
              const Icon = ICONS[it.icon];
              const active = isActive(pathname, it.href);
              return (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative flex min-h-10 items-center gap-3 rounded-sm px-3 text-[14px] font-medium transition-colors",
                      dark
                        ? active ? "bg-white/10 text-white before:absolute before:inset-y-2 before:start-0 before:w-0.5 before:rounded-full before:bg-brass-500" : "text-white/70 hover:bg-white/5 hover:text-white"
                        : active ? "bg-brand-50 text-brand-800" : "text-ink-2 hover:bg-black/5",
                    )}
                  >
                    <Icon className="size-[18px] shrink-0" aria-hidden />
                    <span className="flex-1 truncate">{it.label}</span>
                    {it.badge ? <span className="min-w-5 rounded-xs bg-bad-600 px-1.5 text-center text-[11.5px] font-semibold leading-5 text-white tabular-nums">{it.badge}</span> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function BellMenu({ items, unread }: { items: BellItem[]; unread: number }) {
  const { t } = useI18n();
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button type="button" className="relative flex size-10 items-center justify-center rounded-sm text-ink-2 hover:bg-black/5 md:size-9" aria-label={t("nav.notifications_title")}>
          <Bell className="size-5" aria-hidden />
          {unread > 0 ? <span className="absolute end-1 top-1 min-w-4 rounded-full bg-bad-600 px-1 text-center text-[10.5px] font-semibold leading-4 text-white tabular-nums">{unread > 99 ? "99+" : unread}</span> : null}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={6} collisionPadding={8} className="anim-pop z-50 w-[min(24rem,calc(100vw-1rem))] rounded-md border border-line bg-surface shadow-pop">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <p className="text-[14px] font-semibold">{t("nav.notifications_title")}</p>
            {unread > 0 ? (
              <form action={markNotificationsReadAction}>
                <button className="text-[12.5px] font-medium text-brand-700 hover:underline">{t("nav.mark_all_read")}</button>
              </form>
            ) : null}
          </div>
          <ul className="max-h-[60dvh] divide-y divide-line overflow-y-auto">
            {items.length === 0 ? <li className="px-4 py-8 text-center text-[13.5px] text-ink-3">{t("nav.no_notifications")}</li> : null}
            {items.map((n) => {
              const inner = (
                <div className={cn("px-4 py-3", n.unread && "bg-brand-50/60")}>
                  <p className={cn("text-[13.5px]", n.urgent ? "font-semibold text-bad-700" : "font-medium text-ink")}>{n.subject}</p>
                  <p className="mt-0.5 line-clamp-2 text-[13px] text-ink-2">{n.body}</p>
                  <p className="mt-1 text-[11.5px] text-ink-3">{n.at}</p>
                </div>
              );
              return <li key={n.id}>{n.link ? <Link href={n.link}>{inner}</Link> : inner}</li>;
            })}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function StaffFrame({
  groups, bottom, orgName, userName, roleLabel, bell, unread, children, locale, backPath,
}: {
  groups: NavGroup[]; bottom: NavItem[]; orgName: string; userName: string; roleLabel: string; bell: BellItem[]; unread: number; children: ReactNode; locale: "en" | "ar"; backPath: string;
}) {
  const { t } = useI18n();
  const [drawer, setDrawer] = useState(false);
  const pathname = usePathname();
  const other = locale === "ar" ? "en" : "ar";
  const profile = (
    <div className="border-t border-white/10 p-3">
      <p className="truncate text-[13.5px] font-medium text-white">{userName}</p>
      <p className="truncate text-[12px] text-white/55">{roleLabel}</p>
      <div className="mt-2 flex gap-1.5">
        <form action={setLocaleAction} className="flex-1">
          <input type="hidden" name="locale" value={other} />
          <input type="hidden" name="back" value={backPath} />
          <button className="h-9 w-full rounded-sm bg-white/10 text-[13px] font-medium text-white hover:bg-white/15" lang={other}>{other === "ar" ? "العربية" : "English"}</button>
        </form>
        <form action={signOutAction}>
          <button className="flex h-9 items-center gap-1.5 rounded-sm bg-white/10 px-3 text-[13px] font-medium text-white hover:bg-white/15" aria-label={t("nav.sign_out")}>
            <LogOut className="rtl-flip size-4" aria-hidden />
            <span className="hidden xl:inline">{t("nav.sign_out")}</span>
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh md:ps-[var(--spacing-sidebar)]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-2 focus:top-2 focus:z-[60] focus:rounded-sm focus:bg-white focus:px-3 focus:py-2">{t("common.skip_to_content")}</a>
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 start-0 z-30 hidden w-[var(--spacing-sidebar)] flex-col bg-brand-900 md:flex">
        <div className="px-4 pb-3 pt-5"><Wordmark inverse locale={locale} /></div>
        <p className="truncate px-5 pb-3 text-[12.5px] text-white/55">{orgName}</p>
        <div className="flex-1 overflow-y-auto px-2 pb-4"><NavList groups={groups} dark /></div>
        {profile}
      </aside>

      {/* Top bar */}
      <header className="pt-safe sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
        <div className="flex h-14 items-center gap-2 px-3 md:h-14 md:px-6">
          <button type="button" className="flex size-10 items-center justify-center rounded-sm text-ink-2 hover:bg-black/5 md:hidden" onClick={() => setDrawer(true)} aria-label={t("common.menu")}>
            <Menu className="size-5" />
          </button>
          <div className="md:hidden"><Wordmark locale={locale} className="[&_svg]:size-7" /></div>
          <form action="/search" role="search" className="relative ms-auto hidden max-w-md flex-1 md:ms-0 md:block">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
            <input name="q" type="search" placeholder={t("nav.search_placeholder")} aria-label={t("common.search")} className="h-9 w-full rounded-sm border border-line bg-canvas ps-9 pe-3 text-[14px] placeholder:text-ink-3 focus:border-brand-500 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-brand-500/20" />
          </form>
          <div className="ms-auto flex items-center gap-1 md:ms-3">
            <Link href="/search" className="flex size-10 items-center justify-center rounded-sm text-ink-2 hover:bg-black/5 md:hidden" aria-label={t("common.search")}><Search className="size-5" /></Link>
            <BellMenu items={bell} unread={unread} />
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-[1400px] px-4 pb-[calc(5.5rem+var(--safe-bottom))] pt-5 md:px-6 md:pb-10 md:pt-6">{children}</main>

      {/* Phone bottom navigation */}
      <nav aria-label="Primary" className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface md:hidden">
        <ul className="mx-auto flex max-w-lg">
          {bottom.map((it) => {
            const Icon = ICONS[it.icon];
            const active = isActive(pathname, it.href);
            return (
              <li key={it.href} className="flex-1">
                <Link href={it.href} aria-current={active ? "page" : undefined} className={cn("relative flex h-[3.75rem] flex-col items-center justify-center gap-0.5 text-[11.5px] font-medium", active ? "text-brand-800" : "text-ink-3")}>
                  <span className="relative">
                    <Icon className="size-[22px]" aria-hidden />
                    {it.badge ? <span className="absolute -end-2 -top-1 min-w-4 rounded-full bg-bad-600 px-1 text-center text-[10px] font-semibold leading-4 text-white">{it.badge}</span> : null}
                  </span>
                  <span className="max-w-full truncate px-1">{it.label}</span>
                  {active ? <span className="absolute inset-x-5 top-0 h-0.5 rounded-full bg-brass-500" /> : null}
                </Link>
              </li>
            );
          })}
          <li className="flex-1">
            <button type="button" onClick={() => setDrawer(true)} className="flex h-[3.75rem] w-full flex-col items-center justify-center gap-0.5 text-[11.5px] font-medium text-ink-3">
              <Menu className="size-[22px]" aria-hidden />
              {t("common.more")}
            </button>
          </li>
        </ul>
      </nav>

      {/* Phone drawer, opens from the reading-start side so it follows RTL */}
      <Dialog.Root open={drawer} onOpenChange={setDrawer}>
        <Dialog.Portal>
          <Dialog.Overlay className="anim-overlay fixed inset-0 z-40 bg-brand-950/50 md:hidden" />
          <Dialog.Content className="pt-safe fixed inset-y-0 start-0 z-50 flex w-[min(20rem,86vw)] flex-col bg-brand-900 shadow-pop outline-none md:hidden">
            <Dialog.Title className="sr-only">{t("common.menu")}</Dialog.Title>
            <Dialog.Description className="sr-only">{orgName}</Dialog.Description>
            <div className="flex items-center justify-between px-4 pb-2 pt-4">
              <Wordmark inverse locale={locale} />
              <Dialog.Close className="rounded-sm p-2 text-white/70 hover:bg-white/10" aria-label={t("common.close")}><X className="size-5" /></Dialog.Close>
            </div>
            <p className="truncate px-5 pb-3 text-[12.5px] text-white/55">{orgName}</p>
            <div className="flex-1 overflow-y-auto px-2 pb-4"><NavList groups={groups} dark onNavigate={() => setDrawer(false)} /></div>
            <div className="pb-safe">{profile}</div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

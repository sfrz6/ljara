import type { ReactNode } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { requireTenant } from "@/lib/context";
import { unreadCount } from "@/domain/notifications";
import { Wordmark } from "@/components/brand";
import { PortalNav } from "@/components/shell/portal-nav";
import { LanguageSwitch } from "@/components/language-switch";
import { pickName } from "@/i18n";

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const s = await requireTenant();
  const unread = await unreadCount(s.db, s.ctx.orgId, "tenant", s.tenant.id);
  const items = [
    { href: "/portal", label: s.t("nav.home"), icon: "home" as const },
    { href: "/portal/schedule", label: s.t("nav.schedule"), icon: "calendar" as const },
    { href: "/portal/maintenance", label: s.t("nav.requests"), icon: "wrench" as const },
    { href: "/portal/profile", label: s.t("nav.profile"), icon: "user" as const },
  ];
  return (
    <div className="min-h-dvh bg-canvas">
      <header className="pt-safe sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4">
          <Wordmark locale={s.locale} className="[&_svg]:size-7" />
          <div className="flex items-center gap-1">
            <LanguageSwitch locale={s.locale} />
            <Link href="/portal/notifications" className="relative flex size-10 items-center justify-center rounded-sm text-ink-2 hover:bg-black/5" aria-label={s.t("nav.notifications_title")}>
              <Bell className="size-5" />
              {unread > 0 ? <span className="absolute end-1 top-1 min-w-4 rounded-full bg-bad-600 px-1 text-center text-[10.5px] font-semibold leading-4 text-white">{unread}</span> : null}
            </Link>
          </div>
        </div>
      </header>
      <p className="sr-only">{pickName(s.locale, s.tenant.nameEn, s.tenant.nameAr)}</p>
      <main className="mx-auto w-full max-w-2xl px-4 pb-[calc(5.5rem+var(--safe-bottom))] pt-5">{children}</main>
      <PortalNav items={items} />
    </div>
  );
}

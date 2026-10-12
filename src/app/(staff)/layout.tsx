import { desc, eq, and, sql } from "drizzle-orm";

import type { ReactNode } from "react";
import { notifications, maintenanceRequests, cheques } from "@/db/schema";
import { requireStaff } from "@/lib/context";
import { StaffFrame, type BellItem, type NavGroup, type NavItem } from "@/components/shell/staff-frame";
import { formatDateTime } from "@/lib/dates";
import { unreadCount } from "@/domain/notifications";
import { pickName } from "@/i18n";

export default async function StaffLayout({ children }: { children: ReactNode }) {
  const s = await requireStaff();
  const { t, db, ctx } = s;
  const c = s.can;

  const [unread, rows, bouncedRow] = await Promise.all([
    unreadCount(db, ctx.orgId, "user", s.user.id),
    db.select().from(notifications).where(and(eq(notifications.orgId, ctx.orgId), eq(notifications.recipientKind, "user"), eq(notifications.recipientId, s.user.id), eq(notifications.channel, "in_app"))).orderBy(desc(notifications.createdAt)).limit(10),
    c("cheques:view")
      ? db.select({ n: sql<number>`count(*)::int` }).from(cheques).where(and(eq(cheques.orgId, ctx.orgId), sql`${cheques.status} in ('bounced','follow_up')`))
      : Promise.resolve([{ n: 0 }]),
  ]);
  const newRequests = c("maintenance:manage")
    ? (await db.select({ n: sql<number>`count(*)::int` }).from(maintenanceRequests).where(and(eq(maintenanceRequests.orgId, ctx.orgId), sql`${maintenanceRequests.status} = 'submitted'`)))[0].n
    : 0;

  const bell: BellItem[] = rows.map((n) => ({
    id: n.id, subject: n.subject, body: n.body, link: n.link, urgent: n.urgent, unread: !n.readAt, at: formatDateTime(n.createdAt, s.locale),
  }));

  const item = (perm: Parameters<typeof c>[0], href: string, label: string, icon: NavItem["icon"], badge?: number): NavItem | null =>
    c(perm) ? { href, label, icon, badge: badge || undefined } : null;
  const compact = (xs: (NavItem | null)[]) => xs.filter((x): x is NavItem => !!x);

  const groups: NavGroup[] = [
    { items: compact([item("dashboard:view", "/dashboard", t("nav.dashboard"), "dashboard")]) },
    { label: t("nav.portfolio"), items: compact([item("owners:view", "/owners", t("nav.owners"), "owners"), item("buildings:view", "/buildings", t("nav.buildings"), "buildings"), item("units:view", "/units", t("nav.units"), "units")]) },
    { label: t("nav.leasing"), items: compact([item("tenants:view", "/tenants", t("nav.tenants"), "tenants"), item("contracts:view", "/contracts", t("nav.contracts"), "contracts")]) },
    { label: t("nav.finance"), items: compact([item("cheques:view", "/cheques", t("nav.cheques"), "cheques", bouncedRow[0].n), item("receipts:view", "/receipts", t("nav.receipts"), "receipts"), item("statements:view", "/statements", t("nav.statements"), "statements")]) },
    { label: t("nav.operations"), items: compact([item("maintenance:view", "/maintenance", t("nav.maintenance"), "maintenance", newRequests), c("inspections:perform") || c("inspections:approve") ? { href: "/inspections", label: t("nav.inspections"), icon: "inspections" as const } : null]) },
    { label: t("nav.admin"), items: compact([item("imports:manage", "/imports", t("nav.imports"), "imports"), item("notifications:view", "/notifications", t("nav.notifications"), "notifications"), item("audit:view", "/audit", t("nav.audit"), "audit"), item("settings:view", "/settings", t("nav.settings"), "settings")]) },
  ].filter((g) => g.items.length > 0);

  const all = groups.flatMap((g) => g.items);
  const prefer: Record<string, string[]> = {
    manager: ["/dashboard", "/cheques", "/maintenance", "/units"],
    accounts: ["/dashboard", "/cheques", "/receipts", "/tenants"],
    maintenance: ["/dashboard", "/maintenance", "/inspections", "/units"],
    contracts: ["/dashboard", "/contracts", "/tenants", "/units"],
  };
  const bottom = (prefer[s.role] ?? []).map((h) => all.find((i) => i.href === h)).filter((x): x is NavItem => !!x);

  const back = "";

  return (
    <StaffFrame
      groups={groups}
      bottom={bottom}
      orgName={s.org ? pickName(s.locale, s.org.name, s.org.nameAr) : ""}
      userName={s.user.name}
      roleLabel={t(`role.${s.role}` as never)}
      bell={bell}
      unread={unread}
      locale={s.locale}
      backPath={back}
    >
      {children}
    </StaffFrame>
  );
}

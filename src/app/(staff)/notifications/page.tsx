import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { MessageSquare } from "lucide-react";
import { notifications, tenants } from "@/db/schema";
import { PAGE_SIZE } from "@/domain/portfolio";
import { markAllRead } from "@/domain/notifications";
import { requireStaff } from "@/lib/context";
import { formatDateTime } from "@/lib/dates";
import { pickName } from "@/i18n";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui/display";
import { Pagination, parsePage } from "@/components/ui/data-table";
import { FilterBar, Tabs } from "@/components/ui/filters";
import { StatusBadge } from "@/components/status";
import { QuickAction } from "@/components/ui/quick-action";
import { runDailyAction } from "@/app/actions/admin";

export const metadata = { title: "Messages" };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireStaff("notifications:view");
  const sp = await searchParams;
  const { t, db, ctx, locale } = s;
  const tab = sp.tab === "mine" ? "mine" : "log";
  const page = parsePage(sp.page);
  const canLog = s.can("settings:view");
  const conds: SQL[] = [eq(notifications.orgId, ctx.orgId)];
  if (tab === "mine" || !canLog) conds.push(eq(notifications.recipientId, s.user.id), eq(notifications.channel, "in_app"));
  else if (sp.channel) conds.push(eq(notifications.channel, sp.channel as "sms"));
  else conds.push(sql`${notifications.channel} <> 'in_app' or ${notifications.recipientKind} = 'user'`);
  if (sp.status) conds.push(eq(notifications.status, sp.status as "sent"));
  const where = and(...conds);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(notifications).where(where);
  const rows = await db
    .select({ n: notifications, tenant: tenants.nameEn, tenantAr: tenants.nameAr })
    .from(notifications)
    .leftJoin(tenants, and(eq(tenants.id, notifications.recipientId), eq(notifications.recipientKind, "tenant")))
    .where(where)
    .orderBy(desc(notifications.createdAt))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);
  if (tab === "mine") await markAllRead(db, ctx.orgId, "user", s.user.id);
  return (
    <>
      <PageHeader title={t("nav.notifications")} description={t("notif.page_hint")} actions={s.can("settings:manage") ? <QuickAction action={runDailyAction} hidden={{}} variant="secondary" size="md">{t("notif.run_daily")}</QuickAction> : null} />
      {canLog ? <Tabs basePath="/notifications" active={tab} tabs={[{ value: "log", label: t("notif.delivery_log") }, { value: "mine", label: t("notif.mine") }]} param="tab" /> : null}
      {tab === "log" && canLog ? (
        <FilterBar hasActive={!!(sp.channel || sp.status)} filters={[
          { name: "channel", label: t("notif.channel"), options: ["whatsapp", "sms", "email", "in_app"].map((c) => ({ value: c, label: t(`channel.${c}` as never) })) },
          { name: "status", label: t("common.status"), options: ["queued", "sent", "delivered", "failed"].map((c) => ({ value: c, label: t(`notif.status.${c}` as never) })) },
        ]} />
      ) : null}
      {rows.length === 0 ? <EmptyState icon={<MessageSquare className="size-5" />} title={t("notif.empty_title")} description={t("notif.empty_body")} /> : (
        <ul className="space-y-2.5">
          {rows.map(({ n, tenant, tenantAr }) => (
            <li key={n.id}>
              <Card>
                <div className="space-y-1.5 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="brand">{t(`channel.${n.channel}` as never)}</Badge>
                      <StatusBadge kind="notif" status={n.status} t={t} />
                      {n.urgent ? <Badge tone="bad">{t("priority.urgent")}</Badge> : null}
                      <span className="text-[13px] font-medium">{n.subject}</span>
                    </div>
                    <span className="text-[12px] text-ink-3">{formatDateTime(n.createdAt, locale)}</span>
                  </div>
                  <p className="text-[13.5px] text-ink-2">{n.body}</p>
                  <p className="text-[12px] text-ink-3">
                    {tenant ? `${t("common.tenant")}: ${pickName(locale, tenant, tenantAr)}` : n.recipientKind === "user" ? t("notif.staff") : ""}
                    {n.toAddress ? <> · <bdi className="ltr-num">{n.toAddress}</bdi></> : null}
                    {n.attempts.length > 1 ? ` · ${n.attempts.map((a) => `${t(`channel.${a.channel}` as never)}: ${a.status}`).join(" > ")}` : ""}
                  </p>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} params={{ tab, channel: sp.channel, status: sp.status }} basePath="/notifications" t={t} />
    </>
  );
}

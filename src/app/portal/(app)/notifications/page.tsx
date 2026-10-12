import Link from "next/link";
import { Bell } from "lucide-react";
import { requireTenant } from "@/lib/context";
import { inboxFor } from "@/domain/notifications";
import { formatDateTime } from "@/lib/dates";
import { Card, EmptyState } from "@/components/ui/display";
import { markNotificationsReadAction } from "@/app/actions/common";

export const metadata = { title: "Messages" };

export default async function PortalNotifications() {
  const s = await requireTenant();
  const { t, db, locale } = s;
  const list = await inboxFor(db, s.tenant.orgId, "tenant", s.tenant.id, 50);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-semibold">{t("nav.notifications_title")}</h1>
        {list.some((n) => !n.readAt) ? <form action={markNotificationsReadAction}><button className="text-[13px] font-medium text-brand-700 underline">{t("nav.mark_all_read")}</button></form> : null}
      </div>
      {list.length === 0 ? <EmptyState icon={<Bell className="size-5" />} title={t("nav.no_notifications")} /> : (
        <ul className="space-y-2.5">
          {list.map((n) => {
            const inner = (
              <Card className={n.readAt ? "" : "border-brand-500/40 bg-brand-50/50"}>
                <div className="p-4"><p className="text-[14px] font-semibold">{n.subject}</p><p className="mt-0.5 text-[13.5px] text-ink-2">{n.body}</p><p className="mt-1.5 text-[12px] text-ink-3">{formatDateTime(n.createdAt, locale)}</p></div>
              </Card>
            );
            return <li key={n.id}>{n.link ? <Link href={n.link}>{inner}</Link> : inner}</li>;
          })}
        </ul>
      )}
    </div>
  );
}

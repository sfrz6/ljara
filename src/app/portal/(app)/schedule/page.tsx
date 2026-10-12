import { Download } from "lucide-react";
import { requireTenant } from "@/lib/context";
import { tenantSchedule } from "@/domain/portal";
import { formatDate } from "@/lib/dates";
import { Card, EmptyState, Money, Num } from "@/components/ui/display";
import { StatusBadge } from "@/components/status";
import { buttonClass } from "@/components/ui/button";
import { PayNowButton } from "../pay-now";

export const metadata = { title: "Rent" };

export default async function PortalSchedule() {
  const s = await requireTenant();
  const { t, db, locale } = s;
  const sched = await tenantSchedule(db, { orgId: s.tenant.orgId, tenantId: s.tenant.id });
  return (
    <div className="space-y-4">
      <h1 className="text-[22px] font-semibold">{t("portal.rent_schedule")}</h1>
      {!sched.visible ? <EmptyState title={t("portal.schedule_hidden")} description={t("portal.schedule_hidden_body")} /> : sched.items.length === 0 ? <EmptyState title={t("portal.no_contract")} /> : (
        <ul className="space-y-2.5">
          {sched.items.map((i) => (
            <li key={i.id}>
              <Card className={i.status === "action_needed" ? "border-bad-600/40 bg-bad-50" : ""}>
                <div className="flex items-center justify-between gap-3 p-4">
                  <div>
                    <p className="text-[15px] font-semibold"><Money baisa={i.amountBaisa} locale={locale} /></p>
                    <p className="text-[13px] text-ink-2">{formatDate(i.dueDate, locale)}</p>
                  </div>
                  <StatusBadge kind="sched" status={i.status} t={t} />
                </div>
                {i.status === "action_needed" ? <p className="px-4 pb-3 text-[13.5px] font-medium text-bad-700">{t("portal.action_needed_hint")}</p> : null}
                {i.canPayOnline || i.receiptId ? (
                  <div className="flex flex-col gap-2 border-t border-line px-4 py-3">
                    {i.canPayOnline ? <PayNowButton itemId={i.id} /> : null}
                    {i.receiptId ? <a href={`/api/pdf/receipt/${i.receiptId}`} target="_blank" rel="noreferrer" className={buttonClass("secondary", "md", "w-full")}><Download className="size-4" aria-hidden />{t("portal.download_receipt")} · <Num>{i.receiptNumber}</Num></a> : null}
                  </div>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

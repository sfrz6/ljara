import { Download, Receipt } from "lucide-react";
import { requireTenant } from "@/lib/context";
import { tenantReceipts } from "@/domain/portal";
import { formatDate } from "@/lib/dates";
import { Card, EmptyState, Money, Num } from "@/components/ui/display";
import { buttonClass } from "@/components/ui/button";

export const metadata = { title: "Receipts" };

export default async function PortalReceipts() {
  const s = await requireTenant();
  const { t, db, locale } = s;
  const list = await tenantReceipts(db, { orgId: s.tenant.orgId, tenantId: s.tenant.id });
  return (
    <div className="space-y-4">
      <h1 className="text-[22px] font-semibold">{t("nav.receipts")}</h1>
      {list.length === 0 ? <EmptyState icon={<Receipt className="size-5" />} title={t("portal.no_receipts")} description={t("portal.no_receipts_body")} /> : (
        <ul className="space-y-2.5">
          {list.map((r) => (
            <li key={r.id}>
              <Card>
                <div className="flex items-center justify-between gap-3 p-4">
                  <div><p className="text-[15px] font-semibold"><Num>{r.displayNumber}</Num></p><p className="text-[13px] text-ink-2">{formatDate(r.paidOn, locale)} · <Money baisa={r.amountBaisa} locale={locale} /></p></div>
                  <a href={`/api/pdf/receipt/${r.id}`} target="_blank" rel="noreferrer" className={buttonClass("secondary", "md")}><Download className="size-4" aria-hidden />PDF</a>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

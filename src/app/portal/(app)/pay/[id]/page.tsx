import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { Lock } from "lucide-react";
import { onlinePaymentIntents, scheduleItems } from "@/db/schema";
import { requireTenant } from "@/lib/context";
import { formatDate } from "@/lib/dates";
import { isDemoMode } from "@/lib/demo";
import { Card, CardBody, Money, Num } from "@/components/ui/display";
import { Alert } from "@/components/ui/form";
import { GatewayControls } from "./controls";

export const metadata = { title: "Secure payment" };

/**
 * Simulated payment gateway page. In production this is replaced by a redirect to Thawani or OmanNet; the
 * success and failure buttons here stand in for the gateway callback so the business consequences can be tested.
 */
export default async function GatewayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireTenant();
  const { t, db, locale } = s;
  const [intent] = await db.select().from(onlinePaymentIntents).where(and(eq(onlinePaymentIntents.id, id), eq(onlinePaymentIntents.orgId, s.tenant.orgId), eq(onlinePaymentIntents.tenantId, s.tenant.id)));
  if (!intent) notFound();
  if (intent.status !== "pending") redirect(`/portal/pay/${id}/result?status=${intent.status === "succeeded" ? "succeeded" : "failed"}`);
  const [item] = await db.select().from(scheduleItems).where(eq(scheduleItems.id, intent.scheduleItemId));
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-[13px] text-ink-3"><Lock className="size-4" aria-hidden />{t("portal.gateway_secure")}</div>
      <Card>
        <CardBody className="space-y-4">
          <div>
            <p className="text-[13px] text-ink-3">{t("portal.pay_amount")}</p>
            <p className="text-[32px] font-semibold tracking-tight"><Money baisa={intent.amountBaisa} locale={locale} /></p>
            <p className="text-[13.5px] text-ink-2">{t("portal.pay_for", { date: formatDate(item.dueDate, locale) })}</p>
          </div>
          <p className="text-[12.5px] text-ink-3">{t("portal.pay_ref")} <Num>{intent.gatewayRef}</Num></p>
          {isDemoMode() ? <GatewayControls intentId={intent.id} /> : <Alert>{t("portal.gateway_redirect")}</Alert>}
        </CardBody>
      </Card>
    </div>
  );
}

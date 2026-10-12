import { CheckCircle2, XCircle } from "lucide-react";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { onlinePaymentIntents, payments, receipts } from "@/db/schema";
import { requireTenant } from "@/lib/context";
import { Card, CardBody, Money, Num } from "@/components/ui/display";
import { ButtonLink, buttonClass } from "@/components/ui/button";

export default async function PayResult({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireTenant();
  const { t, db, locale } = s;
  const [intent] = await db.select().from(onlinePaymentIntents).where(and(eq(onlinePaymentIntents.id, id), eq(onlinePaymentIntents.tenantId, s.tenant.id), eq(onlinePaymentIntents.orgId, s.tenant.orgId)));
  if (!intent) notFound();
  const ok = intent.status === "succeeded";
  const [rc] = ok
    ? await db.select({ id: receipts.id, no: receipts.displayNumber }).from(receipts).innerJoin(payments, eq(payments.id, receipts.paymentId)).where(and(eq(payments.scheduleItemId, intent.scheduleItemId), eq(receipts.kind, "receipt"), eq(receipts.status, "issued"))).limit(1)
    : [];
  return (
    <Card>
      <CardBody className="space-y-4 text-center">
        {ok ? <CheckCircle2 className="mx-auto size-14 text-ok-600" aria-hidden /> : <XCircle className="mx-auto size-14 text-bad-600" aria-hidden />}
        <h1 className="text-[22px] font-semibold">{ok ? t("portal.pay_success") : t("portal.pay_failed")}</h1>
        <p className="text-[28px] font-semibold"><Money baisa={intent.amountBaisa} locale={locale} /></p>
        <p className="text-[14px] text-ink-2">{ok ? t("portal.pay_success_body") : t("portal.pay_failed_body")}</p>
        {rc ? <a href={`/api/pdf/receipt/${rc.id}`} target="_blank" rel="noreferrer" className={buttonClass("secondary", "lg", "w-full")}>{t("portal.download_receipt")} · <Num>{rc.no}</Num></a> : null}
        <ButtonLink href="/portal/schedule" size="lg" className="w-full">{ok ? t("common.done") : t("common.try_again")}</ButtonLink>
      </CardBody>
    </Card>
  );
}

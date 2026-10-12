import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { statements } from "@/db/schema";
import type { StatementSnapshot } from "@/domain/statements";
import { requireStaff } from "@/lib/context";
import { formatDate, formatDateTime } from "@/lib/dates";
import { bpToPercentString } from "@/lib/money";
import { pickName } from "@/i18n";
import { Card, CardBody, CardHeader, Money, Num, PageHeader } from "@/components/ui/display";
import { ShareBar } from "./share-bar";
import { AuditTrail } from "@/components/audit-trail";

export default async function StatementDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireStaff("statements:view");
  const { t, db, ctx, locale } = s;
  const [st] = await db.select().from(statements).where(and(eq(statements.id, id), eq(statements.orgId, ctx.orgId)));
  if (!st) notFound();
  const d = st.snapshot as StatementSnapshot;
  const tot = d.totals;
  const line = (label: string, amount: number, minus = false, strong = false) => (
    <div className={`flex items-baseline justify-between gap-4 py-2.5 ${strong ? "border-t-2 border-brand-800 text-[16px] font-semibold" : "border-b border-line"}`}>
      <span>{label}</span>
      <span>{minus ? "- " : ""}<Money baisa={amount} locale={locale} strong={strong} /></span>
    </div>
  );
  return (
    <>
      <PageHeader
        title={<><Num>{st.number}</Num> · {pickName(locale, d.owner.nameEn, d.owner.nameAr)}</>}
        description={`${formatDate(st.periodFrom, locale)} to ${formatDate(st.periodTo, locale)} · ${formatDateTime(st.generatedAt, locale)}`}
        breadcrumbs={[{ href: "/statements", label: t("nav.statements") }, { label: st.number }]}
        actions={<ShareBar id={st.id} number={st.number} />}
      />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title={t("statement.summary")} />
          <CardBody>
            {line(t("statement.rent_collected"), tot.rentCollectedBaisa)}
            {line(t("statement.maintenance"), tot.maintenanceBaisa, true)}
            {line(`${t("statement.mgmt_fee")} (${bpToPercentString(d.owner.commissionBp)}%)`, tot.managementFeeBaisa, true)}
            {tot.gatewayFeeLineBaisa ? line(t("statement.gateway_fee"), tot.gatewayFeeLineBaisa, true) : null}
            {d.vat.enabled ? line(t("statement.vat"), tot.vatOnFeeBaisa, true) : null}
            {line(t("statement.net"), tot.netToOwnerBaisa, false, true)}
            <p className="mt-3 text-[12.5px] text-ink-3">{t("statement.security_note")}</p>
          </CardBody>
        </Card>
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader title={t("statement.rent_lines")} />
            <ul className="divide-y divide-line">
              {d.rentLines.length === 0 ? <li className="px-5 py-4 text-ink-3">{t("common.no_results")}</li> : d.rentLines.map((l, i) => (
                <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13.5px] md:px-5">
                  <span>{formatDate(l.paidOn, locale)} · {l.unit} · {pickName(locale, l.tenant, l.tenantAr)} <span className="text-ink-3">· <Num>{l.receiptNumber}</Num></span></span>
                  <Money baisa={l.amountBaisa} locale={locale} />
                </li>
              ))}
            </ul>
          </Card>
          <Card>
            <CardHeader title={t("statement.maint_lines")} />
            <ul className="divide-y divide-line">
              {d.maintenanceLines.length === 0 ? <li className="px-5 py-4 text-ink-3">{t("common.no_results")}</li> : d.maintenanceLines.map((l, i) => (
                <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13.5px] md:px-5">
                  <span>{formatDate(l.completedOn, locale)} · {l.unit} · {pickName(locale, l.category, l.categoryAr)}<span className="block text-[12.5px] text-ink-3">{l.work}</span></span>
                  <Money baisa={l.costBaisa} locale={locale} />
                </li>
              ))}
            </ul>
          </Card>
          <AuditTrail entityType="statement" entityId={st.id} />
        </div>
      </div>
    </>
  );
}

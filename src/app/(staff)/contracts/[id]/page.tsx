import { notFound } from "next/navigation";
import Link from "next/link";
import { and, asc, eq, inArray } from "drizzle-orm";
import { FileText } from "lucide-react";
import { buildings, cheques, contracts, scheduleItems, securityDeposits, tenants, units } from "@/db/schema";
import { requireStaff } from "@/lib/context";
import { diffDays, formatDate, formatRange, todayISO } from "@/lib/dates";
import { pickName } from "@/i18n";
import { Alert } from "@/components/ui/form";
import { Badge, Card, CardBody, CardHeader, DefinitionList, Money, Num, PageHeader } from "@/components/ui/display";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { StatusBadge } from "@/components/status";
import { AuditTrail } from "@/components/audit-trail";
import { ContractActions, ScheduleRowActions } from "./contract-actions";

export default async function ContractDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireStaff("contracts:view");
  const { t, db, ctx, locale } = s;
  const [row] = await db
    .select({ c: contracts, unit: units, building: buildings.nameEn, buildingAr: buildings.nameAr, tenant: tenants })
    .from(contracts)
    .innerJoin(units, eq(units.id, contracts.unitId))
    .innerJoin(buildings, eq(buildings.id, units.buildingId))
    .innerJoin(tenants, eq(tenants.id, contracts.tenantId))
    .where(and(eq(contracts.id, id), eq(contracts.orgId, ctx.orgId)));
  if (!row) notFound();
  const c = row.c;
  const items = await db.select().from(scheduleItems).where(eq(scheduleItems.contractId, c.id)).orderBy(asc(scheduleItems.seq));
  const chq = items.length ? await db.select().from(cheques).where(and(eq(cheques.contractId, c.id), inArray(cheques.scheduleItemId, items.map((i) => i.id)))).orderBy(asc(cheques.createdAt)) : [];
  const [deposit] = await db.select().from(securityDeposits).where(eq(securityDeposits.contractId, c.id));
  const today = todayISO();
  const daysLeft = diffDays(today, c.endDate);
  const showFinance = s.can("cheques:view");
  const liveCheque = (itemId: string) => chq.filter((x) => x.scheduleItemId === itemId && !["returned", "written_off"].includes(x.status)).at(-1);
  const paid = items.filter((i) => i.status === "paid").reduce((a, i) => a + i.amountBaisa, 0);
  const total = items.filter((i) => i.status !== "cancelled").reduce((a, i) => a + i.amountBaisa, 0);

  return (
    <>
      <PageHeader
        title={<Num>{c.reference}</Num>}
        badge={<StatusBadge kind="contract" status={c.status} t={t} />}
        description={<><Link href={`/tenants/${row.tenant.id}`} className="hover:underline">{pickName(locale, row.tenant.nameEn, row.tenant.nameAr)}</Link> · <Link href={`/units/${row.unit.id}`} className="hover:underline">{row.unit.label}</Link> · {pickName(locale, row.building, row.buildingAr)}</>}
        breadcrumbs={[{ href: "/contracts", label: t("nav.contracts") }, { label: c.reference }]}
      />
      {c.status === "active" && !c.renewedToId && !c.noticeGivenOn && daysLeft <= 90 ? (
        <Alert tone={daysLeft <= 30 ? "bad" : "warn"} className="mb-5" title={t("contract.decision_title", { n: Math.max(0, daysLeft) })}>{t("contract.decision_body")}</Alert>
      ) : null}
      {c.noticeGivenOn && c.status === "active" ? <Alert tone="warn" className="mb-5" title={t("contract.notice_banner", { date: formatDate(c.moveOutDate, locale) })}>{t("contract.notice_body")}</Alert> : null}
      {c.renewedToId ? <Alert className="mb-5">{t("contract.renewed_to")} <Link className="font-semibold underline" href={`/contracts/${c.renewedToId}`}>{t("common.view")}</Link></Alert> : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5">
          <Card>
            <CardHeader title={t("common.details")} />
            <CardBody>
              <DefinitionList className="sm:grid-cols-1" items={[
                { label: t("contract.term"), value: <>{formatRange(c.startDate, c.endDate, locale)}</> },
                { label: t("unit.monthly_rent"), value: <Money baisa={c.monthlyRentBaisa} locale={locale} strong /> },
                { label: t("contract.frequency"), value: t(`freq.${c.paymentFrequency}` as never) },
                { label: t("contract.sanad"), value: c.sanadReference },
                { label: t("contract.electricity"), value: c.electricityAccount ? <Num>{c.electricityAccount}</Num> : null },
                { label: t("contract.water"), value: c.waterAccount ? <Num>{c.waterAccount}</Num> : null },
                { label: t("contract.signed_doc"), value: c.signedDocFileId ? <a className={buttonClass("secondary", "sm")} href={`/api/files/${c.signedDocFileId}`} target="_blank" rel="noreferrer"><FileText className="size-4" aria-hidden />{t("common.view")}</a> : null },
                { label: t("common.notes"), value: c.notes },
              ]} />
            </CardBody>
          </Card>
          {deposit && showFinance ? (
            <Card className="border-brass-500/40">
              <CardHeader title={t("contract.security_title")} description={t("contract.security_not_income")} />
              <CardBody className="space-y-2">
                <div className="flex items-center justify-between"><Money baisa={deposit.amountBaisa} locale={locale} strong /><Badge tone={deposit.status === "held" ? "brass" : "neutral"}>{t(`contract.deposit.${deposit.status}` as never)}</Badge></div>
                <p className="text-[13px] text-ink-3">{deposit.bank} <Num>{deposit.chequeNumber}</Num></p>
                {deposit.scanFileId ? <a className={buttonClass("secondary", "sm")} href={`/api/files/${deposit.scanFileId}`} target="_blank" rel="noreferrer">{t("contract.security_scan")}</a> : null}
                {deposit.resolutionNote ? <p className="text-[13px]">{deposit.resolutionNote}</p> : null}
              </CardBody>
            </Card>
          ) : null}
          {s.can("contracts:manage") ? <ContractActions id={c.id} status={c.status} noticeGiven={!!c.noticeGivenOn} renewed={!!c.renewedToId} depositHeld={deposit?.status === "held"} ended={c.status === "ended"} sanad={c.sanadReference ?? ""} notes={c.notes ?? ""} electricity={c.electricityAccount ?? ""} water={c.waterAccount ?? ""} /> : null}
          {s.can("contracts:manage") && c.status === "active" && !c.renewedToId && !c.noticeGivenOn ? <ButtonLink href={`/contracts/new?renew=${c.id}`} size="lg" className="w-full">{t("contract.renew")}</ButtonLink> : null}
        </div>

        <div className="space-y-5 lg:col-span-2">
          {showFinance ? (
            <Card>
              <CardHeader title={t("contract.schedule")} description={<><Money baisa={paid} locale={locale} /> / <Money baisa={total} locale={locale} /></>} />
              <ul className="divide-y divide-line">
                {items.map((i) => {
                  const ch = liveCheque(i.id);
                  const overdue = i.status === "open" && i.dueDate < today;
                  return (
                    <li key={i.id} className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 md:px-5 ${overdue ? "bg-bad-50/60" : ""}`}>
                      <div className="min-w-0">
                        <p className="text-[14px] font-medium"><Num className="text-ink-3">{i.seq}.</Num> {formatDate(i.dueDate, locale)} · <Money baisa={i.amountBaisa} locale={locale} /></p>
                        <p className="text-[12.5px] text-ink-3">{ch ? <>{ch.bank} <Num>#{ch.chequeNumber}</Num></> : t("contract.no_cheque")}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {ch ? <StatusBadge kind="cheque" status={ch.status} t={t} /> : <StatusBadge kind="schedule" status={i.status} t={t} />}
                        {overdue ? <Badge tone="bad">{t("common.overdue_days", { n: diffDays(i.dueDate, today) })}</Badge> : null}
                        <ScheduleRowActions contractId={c.id} itemId={i.id} amount={(i.amountBaisa / 1000).toFixed(3)} dueDate={i.dueDate} open={i.status === "open" && c.status !== "ended"} hasLiveCheque={!!ch && ["received", "due", "deposited", "bounced", "follow_up"].includes(ch.status)} canCheque={s.can("cheques:record")} canPay={s.can("payments:record")} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ) : null}
          <AuditTrail entityType="contract" entityId={c.id} />
        </div>
      </div>
    </>
  );
}

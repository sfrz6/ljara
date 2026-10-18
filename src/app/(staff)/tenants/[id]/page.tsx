import { notFound } from "next/navigation";
import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { FileText, Send } from "lucide-react";
import { contracts, tenants, units, buildings } from "@/db/schema";
import { requireStaff } from "@/lib/context";
import { formatDate, formatRange, formatDateTime } from "@/lib/dates";
import { formatPhone } from "@/lib/phone";
import { pickName } from "@/i18n";
import { Badge, Card, CardBody, CardHeader, DefinitionList, Money, Num, PageHeader } from "@/components/ui/display";
import { StatusBadge } from "@/components/status";
import { ActionDialog } from "@/components/ui/overlays";
import { ManualCodeButton } from "@/components/manual-code";
import { deleteTenantAction, disableTenantLoginAction, issueTenantLoginAction, manualTenantCodeAction } from "@/app/actions/account";
import { TenantLoginButton } from "@/components/tenant-login";
import { QuickAction } from "@/components/ui/quick-action";
import { TenantFields } from "../tenant-fields";
import { resendWelcomeAction, updateTenantAction } from "@/app/actions/portfolio";
import { AuditTrail } from "@/components/audit-trail";
import { ButtonLink, buttonClass } from "@/components/ui/button";

export default async function TenantDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireStaff("tenants:view");
  const { t, db, ctx, locale } = s;
  const [tn] = await db.select().from(tenants).where(and(eq(tenants.id, id), eq(tenants.orgId, ctx.orgId)));
  if (!tn) notFound();
  const history = await db
    .select({ c: contracts, unit: units.label, building: buildings.nameEn, buildingAr: buildings.nameAr })
    .from(contracts)
    .innerJoin(units, eq(units.id, contracts.unitId))
    .innerJoin(buildings, eq(buildings.id, units.buildingId))
    .where(and(eq(contracts.tenantId, tn.id), eq(contracts.orgId, ctx.orgId)))
    .orderBy(desc(contracts.startDate));
  const canContracts = s.can("contracts:view");
  return (
    <>
      <PageHeader
        title={pickName(locale, tn.nameEn, tn.nameAr)}
        badge={<StatusBadge kind="tenant" status={tn.status} t={t} />}
        breadcrumbs={[{ href: "/tenants", label: t("nav.tenants") }, { label: pickName(locale, tn.nameEn, tn.nameAr) }]}
        actions={
          <>
            {s.can("tenants:manage") && !tn.activatedAt ? <QuickAction action={resendWelcomeAction} hidden={{ id: tn.id }} variant="secondary" size="md" icon={<Send className="size-4" />}>{t("tenant.resend")}</QuickAction> : null}
            {s.can("tenants:manage") && tn.status !== "archived" ? <TenantLoginButton action={issueTenantLoginAction} tenantId={tn.id} hasLogin={!!tn.activatedAt} phone={tn.phone} /> : null}
            {s.can("tenants:manage") && tn.activatedAt ? <ActionDialog trigger={t("tenant.login_disable")} title={t("tenant.login_disable")} description={t("tenant.login_disable_hint")} action={disableTenantLoginAction} hidden={{ id: tn.id }} submitVariant="danger" submitLabel={t("tenant.login_disable")} /> : null}
            {s.can("tenants:manage") && tn.status !== "archived" ? <ManualCodeButton action={manualTenantCodeAction} tenantId={tn.id} activated={!!tn.activatedAt} /> : null}
            {s.can("contracts:manage") && !history.some((h) => ["pending", "active"].includes(h.c.status)) && tn.status !== "archived" ? <ButtonLink href={`/contracts/new?tenant=${tn.id}`}>{t("contract.new")}</ButtonLink> : null}
            {s.can("tenants:manage") ? (
              <ActionDialog trigger={t("common.edit")} triggerSize="md" size="lg" title={t("common.edit")} action={updateTenantAction} hidden={{ id: tn.id }} submitLabel={t("common.save")}>
                <TenantFields d={tn} edit />
              </ActionDialog>
            ) : null}
            {s.can("tenants:manage") ? <ActionDialog trigger={t("tenant.delete")} title={t("tenant.delete")} description={t("tenant.delete_hint")} action={deleteTenantAction} hidden={{ id: tn.id }} submitVariant="danger" submitLabel={t("tenant.delete")} warning={t("tenant.delete_warn")} /> : null}
          </>
        }
      />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader title={t("common.details")} />
          <CardBody>
            <DefinitionList className="sm:grid-cols-1" items={[
              { label: t("common.phone"), value: <Num>{formatPhone(tn.phone)}</Num> },
              { label: t("common.email"), value: tn.email },
              { label: t("tenant.id_number"), value: <Num>{tn.idNumber}</Num> },
              { label: t("tenant.language"), value: tn.locale === "ar" ? t("common.arabic") : t("common.english") },
              { label: t("tenant.portal"), value: tn.activatedAt ? <Badge tone="ok" dot>{t("tenant.activated")} · {formatDateTime(tn.activatedAt, locale)}</Badge> : <Badge tone="warn" dot>{t("tenant.not_activated")}</Badge> },
              { label: t("tenant.consent_on"), value: tn.consentAt ? formatDate(tn.consentAt, locale) : null },
              { label: t("tenant.internal_notes"), value: tn.internalNotes },
              { label: t("tenant.id_doc"), value: tn.idDocFileId ? <a className={buttonClass("secondary", "sm")} href={`/api/files/${tn.idDocFileId}`} target="_blank" rel="noreferrer"><FileText className="size-4" aria-hidden />{t("common.view")}</a> : null },
            ]} />
          </CardBody>
        </Card>
        <div className="space-y-5 lg:col-span-2">
          {canContracts ? (
            <Card>
              <CardHeader title={t("nav.contracts")} />
              <ul className="divide-y divide-line">
                {history.length === 0 ? <li className="px-5 py-4 text-[13.5px] text-ink-3">{t("tenant.no_contracts")}</li> : history.map((h) => (
                  <li key={h.c.id}><Link href={`/contracts/${h.c.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-surface-2 md:px-5"><span><Num className="font-medium">{h.c.reference}</Num> · {h.unit} · {pickName(locale, h.building, h.buildingAr)}<span className="block text-[12.5px] text-ink-3">{formatRange(h.c.startDate, h.c.endDate, locale)}</span></span><span className="flex items-center gap-2"><Money baisa={h.c.monthlyRentBaisa} locale={locale} /><StatusBadge kind="contract" status={h.c.status} t={t} /></span></Link></li>
                ))}
              </ul>
            </Card>
          ) : null}
          <AuditTrail entityType="tenant" entityId={tn.id} />
        </div>
      </div>
    </>
  );
}

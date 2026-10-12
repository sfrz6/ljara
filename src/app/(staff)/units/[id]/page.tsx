import { notFound } from "next/navigation";
import Link from "next/link";
import { and, desc, eq } from "drizzle-orm";
import { buildings, contracts, maintenanceRequests, owners, tenants, units } from "@/db/schema";
import { whyNotAvailable } from "@/domain/portfolio";
import type { UnitStatus } from "@/domain/machines";
import { requireStaff } from "@/lib/context";
import { formatDate, formatRange, formatDateTime } from "@/lib/dates";
import { bpToPercentString } from "@/lib/money";
import { pickName, type Key } from "@/i18n";
import { Alert } from "@/components/ui/form";
import { Card, CardBody, CardHeader, DefinitionList, Money, Num, PageHeader } from "@/components/ui/display";
import { Stepper } from "@/components/ui/stepper";
import { StatusBadge } from "@/components/status";
import { ButtonLink } from "@/components/ui/button";
import { ActionDialog } from "@/components/ui/overlays";
import { Field, FormGrid, Input, MoneyInput, Select } from "@/components/ui/form";
import { updateUnitAction } from "@/app/actions/portfolio";
import { AuditTrail } from "@/components/audit-trail";
import { resolveRentCap } from "@/domain/finance";
import { organisations } from "@/db/schema";

export default async function UnitDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireStaff("units:view");
  const { t, db, ctx, locale } = s;
  const [row] = await db
    .select({ u: units, building: buildings.nameEn, buildingAr: buildings.nameAr, owner: owners })
    .from(units)
    .innerJoin(buildings, eq(buildings.id, units.buildingId))
    .innerJoin(owners, eq(owners.id, units.ownerId))
    .where(and(eq(units.id, id), eq(units.orgId, ctx.orgId)));
  if (!row) notFound();
  const u = row.u;
  const [active] = await db
    .select({ c: contracts, tenant: tenants.nameEn, tenantAr: tenants.nameAr })
    .from(contracts)
    .innerJoin(tenants, eq(tenants.id, contracts.tenantId))
    .where(and(eq(contracts.unitId, u.id), eq(contracts.orgId, ctx.orgId), eq(contracts.status, "active")));
  const [org] = await db.select().from(organisations).where(eq(organisations.id, ctx.orgId));
  const cap = resolveRentCap({ unitCapBp: u.rentIncreaseCapBp, ownerCapBp: row.owner.rentIncreaseCapBp, orgCapBp: org.rentIncreaseCapBp });
  const requests = s.can("maintenance:view")
    ? await db.select().from(maintenanceRequests).where(and(eq(maintenanceRequests.unitId, u.id), eq(maintenanceRequests.orgId, ctx.orgId))).orderBy(desc(maintenanceRequests.createdAt)).limit(8)
    : [];

  const shown: UnitStatus = u.status === "vacated" ? "under_inspection" : (u.status as UnitStatus);
  const steps = (["available", "reserved", "occupied", "notice_given", "under_inspection", "inspected"] as const).map((k) => ({ key: k, label: t(`unit.status.${k}` as never) }));
  const blocked = whyNotAvailable(u.status as UnitStatus);

  return (
    <>
      <PageHeader
        title={u.label}
        badge={<StatusBadge kind="unit" status={u.status} t={t} />}
        description={<><Link href={`/buildings/${u.buildingId}`} className="hover:underline">{pickName(locale, row.building, row.buildingAr)}</Link> · <Link href={`/owners/${row.owner.id}`} className="hover:underline">{pickName(locale, row.owner.nameEn, row.owner.nameAr)}</Link></>}
        breadcrumbs={[{ href: "/units", label: t("nav.units") }, { label: u.label }]}
        actions={
          <>
            {u.status === "available" && s.can("contracts:manage") ? <ButtonLink href={`/contracts/new?unit=${u.id}`}>{t("contract.new")}</ButtonLink> : null}
            {s.can("maintenance:create") ? <ButtonLink href={`/maintenance/new?unit=${u.id}`} variant="secondary">{t("maint.new")}</ButtonLink> : null}
            {s.can("units:manage") ? (
              <ActionDialog trigger={t("common.edit")} triggerSize="md" title={t("common.edit")} action={updateUnitAction} hidden={{ id: u.id }} submitLabel={t("common.save")}>
                <FormGrid>
                  <Field label={t("unit.label")} name="label" required><Input name="label" defaultValue={u.label} /></Field>
                  <Field label={t("unit.floor")} name="floor" optional><Input name="floor" defaultValue={u.floor ?? ""} /></Field>
                  <Field label={t("unit.type")} name="type"><Select name="type" defaultValue={u.type}>{["apartment", "villa", "studio", "shop", "office", "warehouse"].map((x) => <option key={x} value={x}>{t(`unit.type.${x}` as never)}</option>)}</Select></Field>
                  <Field label={t("unit.bedrooms")} name="bedrooms" optional><Input name="bedrooms" type="number" min={0} defaultValue={u.bedrooms ?? ""} /></Field>
                  <Field label={t("unit.monthly_rent")} name="rent" required><MoneyInput name="rent" defaultValue={(u.rentBaisa / 1000).toFixed(3)} /></Field>
                  <Field label={t("owner.cap")} name="capPercent" hint={t("unit.cap_hint")} optional><Input name="capPercent" inputMode="decimal" defaultValue={u.rentIncreaseCapBp != null ? bpToPercentString(u.rentIncreaseCapBp) : ""} /></Field>
                </FormGrid>
              </ActionDialog>
            ) : null}
          </>
        }
      />
      {blocked ? (
        <Alert tone={u.status === "under_inspection" || u.status === "inspected" ? "bad" : "info"} className="mb-5" title={u.status === "under_inspection" || u.status === "inspected" ? t("unit.cannot_available") : undefined}>
          {t(`unit.${blocked}` as Key)}
          {u.status === "inspected" && s.can("inspections:approve") ? <> <Link href="/inspections" className="font-semibold underline">{t("insp.approve")}</Link></> : null}
          {u.status === "under_inspection" && s.can("inspections:perform") ? <> <Link href="/inspections" className="font-semibold underline">{t("insp.perform")}</Link></> : null}
        </Alert>
      ) : null}
      <Card className="mb-5"><CardBody><Stepper steps={steps} current={shown} tone={shown === "under_inspection" ? "bad" : "brand"} /><p className="mt-3 text-[12.5px] text-ink-3">{t("unit.since", { date: formatDateTime(u.statusSince, locale) })}</p></CardBody></Card>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader title={t("common.details")} />
          <CardBody>
            <DefinitionList className="sm:grid-cols-1" items={[
              { label: t("unit.type"), value: t(`unit.type.${u.type}` as never) },
              { label: t("unit.bedrooms"), value: u.bedrooms != null ? <Num>{u.bedrooms}</Num> : null },
              { label: t("unit.floor"), value: u.floor },
              { label: t("unit.monthly_rent"), value: <Money baisa={u.rentBaisa} locale={locale} strong /> },
              { label: t("owner.cap"), value: cap.capBp != null ? <><Num>{bpToPercentString(cap.capBp)}%</Num> <span className="text-ink-3">({t(`cap.level.${cap.level}` as never)})</span></> : t("common.not_set") },
            ]} />
          </CardBody>
        </Card>
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader title={t("contract.current")} />
            <CardBody>
              {active ? (
                <Link href={`/contracts/${active.c.id}`} className="block hover:underline">
                  <p className="font-medium">{pickName(locale, active.tenant, active.tenantAr)} · <Num>{active.c.reference}</Num></p>
                  <p className="text-[13px] text-ink-2">{formatRange(active.c.startDate, active.c.endDate, locale)} · <Money baisa={active.c.monthlyRentBaisa} locale={locale} /></p>
                </Link>
              ) : <p className="text-[13.5px] text-ink-3">{t("contract.none_active")}</p>}
            </CardBody>
          </Card>
          {requests.length > 0 ? (
            <Card>
              <CardHeader title={t("nav.maintenance")} />
              <ul className="divide-y divide-line">
                {requests.map((r) => (<li key={r.id}><Link href={`/maintenance/${r.id}`} className="flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-surface-2 md:px-5"><span className="text-[14px]">{r.title}<span className="block text-[12px] text-ink-3">{formatDate(r.createdAt, locale)}</span></span><StatusBadge kind="maint" status={r.status} t={t} /></Link></li>))}
              </ul>
            </Card>
          ) : null}
          <AuditTrail entityType="unit" entityId={u.id} />
        </div>
      </div>
    </>
  );
}

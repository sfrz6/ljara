import { notFound } from "next/navigation";
import Link from "next/link";
import { and, asc, eq, isNull } from "drizzle-orm";
import { buildings, contracts, owners, tenants, units } from "@/db/schema";
import { buildingCollection } from "@/domain/dashboard";
import { requireStaff } from "@/lib/context";
import { pickName } from "@/i18n";
import { Card, CardBody, CardHeader, Money, Num, PageHeader, ProgressBar } from "@/components/ui/display";
import { DataTable, type Column } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/status";
import { ActionDialog } from "@/components/ui/overlays";
import { Field, FormGrid, Input, MoneyInput, Select, Textarea } from "@/components/ui/form";
import { archiveBuildingAction, createUnitAction, createUnitsRangeAction, updateBuildingAction } from "@/app/actions/portfolio";
import { AuditTrail } from "@/components/audit-trail";
import { todayISO } from "@/lib/dates";

export default async function BuildingDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireStaff("buildings:view");
  const { t, db, ctx, locale } = s;
  const [row] = await db.select({ b: buildings, owner: owners.nameEn, ownerAr: owners.nameAr, ownerId: owners.id }).from(buildings).innerJoin(owners, eq(owners.id, buildings.ownerId)).where(and(eq(buildings.id, id), eq(buildings.orgId, ctx.orgId)));
  if (!row) notFound();
  const b = row.b;
  const list = await db
    .select({ u: units, tenant: tenants.nameEn, tenantAr: tenants.nameAr })
    .from(units)
    .leftJoin(contracts, and(eq(contracts.unitId, units.id), eq(contracts.status, "active")))
    .leftJoin(tenants, eq(tenants.id, contracts.tenantId))
    .where(and(eq(units.buildingId, b.id), isNull(units.archivedAt)))
    .orderBy(asc(units.label));
  const coll = s.can("cheques:view") ? (await buildingCollection(db, ctx.orgId, todayISO())).find((x) => x.buildingId === b.id) : undefined;
  type Row = (typeof list)[number];
  const columns: Column<Row>[] = [
    { key: "l", header: t("common.unit"), mobile: "title", cell: (r) => <>{r.u.label}</> },
    { key: "s", header: t("common.status"), mobile: "badge", cell: (r) => <StatusBadge kind="unit" status={r.u.status} t={t} /> },
    { key: "t", header: t("common.tenant"), mobile: "subtitle", cell: (r) => <>{r.tenant ? pickName(locale, r.tenant, r.tenantAr) : "-"}</> },
    { key: "ty", header: t("common.type"), label: t("common.type"), cell: (r) => <>{t(`unit.type.${r.u.type}` as never)}</> },
    { key: "r", header: t("common.rent"), label: t("common.rent"), align: "end", cell: (r) => <Money baisa={r.u.rentBaisa} locale={locale} /> },
  ];
  const unitFields = (
    <FormGrid>
      <Field label={t("unit.type")} name="type"><Select name="type" defaultValue="apartment">{["apartment", "villa", "studio", "shop", "office", "warehouse"].map((x) => <option key={x} value={x}>{t(`unit.type.${x}` as never)}</option>)}</Select></Field>
      <Field label={t("unit.bedrooms")} name="bedrooms" optional><Input name="bedrooms" type="number" min={0} /></Field>
      <Field label={t("unit.monthly_rent")} name="rent" required><MoneyInput name="rent" /></Field>
    </FormGrid>
  );
  return (
    <>
      <PageHeader
        title={pickName(locale, b.nameEn, b.nameAr)}
        description={<>{b.area} · <Link href={`/owners/${row.ownerId}`} className="hover:underline">{pickName(locale, row.owner, row.ownerAr)}</Link></>}
        breadcrumbs={[{ href: "/buildings", label: t("nav.buildings") }, { label: pickName(locale, b.nameEn, b.nameAr) }]}
        actions={s.can("units:manage") ? (
          <>
            <ActionDialog trigger={t("unit.add_many")} triggerSize="md" title={t("unit.add_many")} description={t("unit.add_many_hint")} action={createUnitsRangeAction} hidden={{ buildingId: b.id }} submitLabel={t("common.create")}>
              <FormGrid cols={3}>
                <Field label={t("unit.prefix")} name="prefix" optional><Input name="prefix" placeholder="A-" /></Field>
                <Field label={t("common.from")} name="from" required><Input name="from" type="number" min={0} defaultValue={101} /></Field>
                <Field label={t("common.to")} name="to" required><Input name="to" type="number" min={0} defaultValue={110} /></Field>
              </FormGrid>
              {unitFields}
            </ActionDialog>
            <ActionDialog trigger={t("unit.add")} triggerVariant="primary" triggerSize="md" title={t("unit.add")} action={createUnitAction} hidden={{ buildingId: b.id }} submitLabel={t("common.create")}>
              <FormGrid>
                <Field label={t("unit.label")} name="label" required><Input name="label" placeholder="A-101" /></Field>
                <Field label={t("unit.floor")} name="floor" optional><Input name="floor" /></Field>
              </FormGrid>
              {unitFields}
            </ActionDialog>
          </>
        ) : null}
      />
      {coll ? (
        <Card className="mb-5">
          <CardHeader title={t("dash.per_building")} />
          <CardBody>
            <div className="mb-1 flex justify-between text-[13.5px]"><Money baisa={coll.collected} locale={locale} /><Money baisa={coll.expected} locale={locale} /></div>
            <ProgressBar value={coll.collected} max={coll.expected} tone={coll.overdue > 0 ? "warn" : "ok"} />
            {coll.overdue > 0 ? <p className="mt-2 text-[13px] font-medium text-bad-600">{t("dash.overdue")}: <Money baisa={coll.overdue} locale={locale} /></p> : null}
          </CardBody>
        </Card>
      ) : null}
      <h2 className="mb-3 text-[15px] font-semibold">{t("nav.units")} <Num className="text-ink-3">({list.length})</Num></h2>
      <DataTable columns={columns} rows={list} rowKey={(r) => r.u.id} rowHref={(r) => `/units/${r.u.id}`} empty={<Card><CardBody className="text-center"><p className="font-medium">{t("unit.empty_title")}</p><p className="mt-1 text-[13.5px] text-ink-2">{t("unit.empty_body")}</p></CardBody></Card>} />
      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        {s.can("buildings:manage") ? (
          <div className="flex flex-wrap gap-2">
            <ActionDialog trigger={t("common.edit")} triggerSize="md" title={t("common.edit")} action={updateBuildingAction} hidden={{ id: b.id }} submitLabel={t("common.save")}>
              <FormGrid>
                <Field label={t("owner.name_en")} name="nameEn" required><Input name="nameEn" defaultValue={b.nameEn} /></Field>
                <Field label={t("owner.name_ar")} name="nameAr" optional><Input name="nameAr" dir="rtl" defaultValue={b.nameAr ?? ""} /></Field>
                <Field label={t("building.area")} name="area" optional><Input name="area" defaultValue={b.area ?? ""} /></Field>
                <Field label={t("building.address")} name="address" optional><Input name="address" defaultValue={b.address ?? ""} /></Field>
              </FormGrid>
              <Field label={t("common.notes")} name="notes" optional><Textarea name="notes" defaultValue={b.notes ?? ""} /></Field>
            </ActionDialog>
            {list.length === 0 ? <ActionDialog trigger={t("common.archive")} triggerVariant="ghost" triggerSize="md" title={t("common.archive")} action={archiveBuildingAction} hidden={{ id: b.id }} submitVariant="danger" /> : null}
          </div>
        ) : null}
        <AuditTrail entityType="building" entityId={b.id} />
      </div>
    </>
  );
}

import { and, eq, isNull, sql, type SQL } from "drizzle-orm";
import { Building2, Plus } from "lucide-react";
import { buildings, owners, units } from "@/db/schema";
import { requireStaff } from "@/lib/context";
import { pickName } from "@/i18n";
import { EmptyState, Num, PageHeader } from "@/components/ui/display";
import { DataTable, type Column } from "@/components/ui/data-table";
import { FilterBar } from "@/components/ui/filters";
import { ActionDialog } from "@/components/ui/overlays";
import { Field, FormGrid, Input, Select, Textarea } from "@/components/ui/form";
import { createBuildingAction } from "@/app/actions/portfolio";
import { ButtonLink } from "@/components/ui/button";

export const metadata = { title: "Buildings" };

export default async function BuildingsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireStaff("buildings:view");
  const sp = await searchParams;
  const { t, db, ctx, locale } = s;
  const conds: SQL[] = [eq(buildings.orgId, ctx.orgId), isNull(buildings.archivedAt)];
  if (sp.owner) conds.push(eq(buildings.ownerId, sp.owner));
  if (sp.q) conds.push(sql`(${buildings.nameEn} ilike ${"%" + sp.q + "%"} or ${buildings.nameAr} ilike ${"%" + sp.q + "%"} or ${buildings.area} ilike ${"%" + sp.q + "%"})`);
  const rows = await db
    .select({ b: buildings, owner: owners.nameEn, ownerAr: owners.nameAr, units: sql<number>`count(${units.id})::int`, vacant: sql<number>`count(${units.id}) filter (where ${units.status} = 'available')::int` })
    .from(buildings)
    .innerJoin(owners, eq(owners.id, buildings.ownerId))
    .leftJoin(units, and(eq(units.buildingId, buildings.id), isNull(units.archivedAt)))
    .where(and(...conds))
    .groupBy(buildings.id, owners.nameEn, owners.nameAr)
    .orderBy(buildings.nameEn);
  const ownerList = await db.select().from(owners).where(and(eq(owners.orgId, ctx.orgId), isNull(owners.archivedAt))).orderBy(owners.nameEn);
  type Row = (typeof rows)[number];
  const columns: Column<Row>[] = [
    { key: "n", header: t("common.building"), mobile: "title", cell: (r) => <>{pickName(locale, r.b.nameEn, r.b.nameAr)}</> },
    { key: "a", header: t("building.area"), mobile: "subtitle", cell: (r) => <>{r.b.area ?? ""}</> },
    { key: "o", header: t("common.owner"), label: t("common.owner"), cell: (r) => <>{pickName(locale, r.owner, r.ownerAr)}</> },
    { key: "u", header: t("common.units"), label: t("common.units"), cell: (r) => <Num>{r.units}</Num> },
    { key: "v", header: t("unit.status.available"), label: t("unit.status.available"), cell: (r) => <Num>{r.vacant}</Num> },
  ];
  return (
    <>
      <PageHeader
        title={t("nav.buildings")}
        description={t("building.page_hint")}
        actions={s.can("buildings:manage") ? (
          ownerList.length === 0 ? <ButtonLink href="/owners">{t("building.add_owner_first")}</ButtonLink> :
          <ActionDialog trigger={t("building.add")} triggerVariant="primary" triggerSize="md" triggerIcon={<Plus className="size-4" />} title={t("building.add")} size="lg" action={createBuildingAction} submitLabel={t("common.create")}>
            <Field label={t("common.owner")} name="ownerId" required><Select name="ownerId" defaultValue={sp.owner ?? ""}><option value="">{t("common.select_placeholder")}</option>{ownerList.map((o) => <option key={o.id} value={o.id}>{pickName(locale, o.nameEn, o.nameAr)}</option>)}</Select></Field>
            <FormGrid>
              <Field label={t("owner.name_en")} name="nameEn" required><Input name="nameEn" /></Field>
              <Field label={t("owner.name_ar")} name="nameAr" optional><Input name="nameAr" dir="rtl" /></Field>
              <Field label={t("building.area")} name="area" optional><Input name="area" /></Field>
              <Field label={t("building.address")} name="address" optional><Input name="address" /></Field>
            </FormGrid>
            <Field label={t("common.notes")} name="notes" optional><Textarea name="notes" rows={2} /></Field>
          </ActionDialog>
        ) : null}
      />
      <FilterBar searchPlaceholder={t("building.search")} hasActive={!!(sp.q || sp.owner)} filters={[{ name: "owner", label: t("common.owner"), options: ownerList.map((o) => ({ value: o.id, label: pickName(locale, o.nameEn, o.nameAr) })) }]} />
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.b.id} rowHref={(r) => `/buildings/${r.b.id}`} empty={<EmptyState icon={<Building2 className="size-5" />} title={t("building.empty_title")} description={t("building.empty_body")} />} />
    </>
  );
}

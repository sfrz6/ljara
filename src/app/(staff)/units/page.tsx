import { and, asc, eq, isNull, sql, type SQL } from "drizzle-orm";
import { Home } from "lucide-react";
import { buildings, contracts, tenants, units } from "@/db/schema";
import { PAGE_SIZE, likeAny } from "@/domain/portfolio";
import { UNIT_STATES } from "@/domain/machines";
import { requireStaff } from "@/lib/context";
import { formatDate } from "@/lib/dates";
import { pickName } from "@/i18n";
import { EmptyState, Money, PageHeader, Num } from "@/components/ui/display";
import { DataTable, Pagination, parsePage, type Column } from "@/components/ui/data-table";
import { FilterBar } from "@/components/ui/filters";
import { StatusBadge } from "@/components/status";

export const metadata = { title: "Units" };

export default async function UnitsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireStaff("units:view");
  const sp = await searchParams;
  const { t, db, ctx, locale } = s;
  const page = parsePage(sp.page);
  const conds: SQL[] = [eq(units.orgId, ctx.orgId), isNull(units.archivedAt)];
  if (sp.status === "rented") conds.push(sql`${units.status} in ('occupied','notice_given')`);
  else if (sp.status === "inspection") conds.push(sql`${units.status} in ('vacated','under_inspection','inspected')`);
  else if (sp.status) conds.push(eq(units.status, sp.status as "available"));
  if (sp.building) conds.push(eq(units.buildingId, sp.building));
  if (sp.owner) conds.push(eq(units.ownerId, sp.owner));
  if (sp.q) conds.push(sql`(${units.label} ilike ${likeAny(sp.q)} or ${buildings.nameEn} ilike ${likeAny(sp.q)} or ${buildings.nameAr} ilike ${likeAny(sp.q)} or ${tenants.nameEn} ilike ${likeAny(sp.q)} or ${tenants.nameAr} ilike ${likeAny(sp.q)})`);
  const base = db
    .select({ u: units, building: buildings.nameEn, buildingAr: buildings.nameAr, tenant: tenants.nameEn, tenantAr: tenants.nameAr, end: contracts.endDate })
    .from(units)
    .innerJoin(buildings, eq(buildings.id, units.buildingId))
    .leftJoin(contracts, and(eq(contracts.unitId, units.id), eq(contracts.status, "active")))
    .leftJoin(tenants, eq(tenants.id, contracts.tenantId))
    .where(and(...conds));
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(units).innerJoin(buildings, eq(buildings.id, units.buildingId)).leftJoin(contracts, and(eq(contracts.unitId, units.id), eq(contracts.status, "active"))).leftJoin(tenants, eq(tenants.id, contracts.tenantId)).where(and(...conds));
  const rows = await base.orderBy(asc(buildings.nameEn), asc(units.label)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE);
  const blds = await db.select().from(buildings).where(and(eq(buildings.orgId, ctx.orgId), isNull(buildings.archivedAt)));
  type Row = (typeof rows)[number];
  const columns: Column<Row>[] = [
    { key: "l", header: t("common.unit"), mobile: "title", cell: (r) => <>{r.u.label}</> },
    { key: "b", header: t("common.building"), mobile: "subtitle", cell: (r) => <>{pickName(locale, r.building, r.buildingAr)}</> },
    { key: "s", header: t("common.status"), mobile: "badge", cell: (r) => <StatusBadge kind="unit" status={r.u.status} t={t} /> },
    { key: "t", header: t("common.tenant"), label: t("common.tenant"), cell: (r) => <>{r.tenant ? pickName(locale, r.tenant, r.tenantAr) : "-"}</> },
    { key: "e", header: t("contract.ends"), label: t("contract.ends"), cell: (r) => <>{r.end ? formatDate(r.end, locale) : "-"}</> },
    { key: "r", header: t("common.rent"), label: t("common.rent"), align: "end", cell: (r) => <Money baisa={r.u.rentBaisa} locale={locale} /> },
  ];
  return (
    <>
      <PageHeader title={t("nav.units")} description={t("unit.page_hint")} />
      <FilterBar
        searchPlaceholder={t("unit.search")}
        hasActive={!!(sp.q || sp.status || sp.building)}
        filters={[
          { name: "status", label: t("common.status"), options: [{ value: "rented", label: t("unit.filter.rented") }, { value: "inspection", label: t("unit.filter.inspection") }, ...UNIT_STATES.map((x) => ({ value: x, label: t(`unit.status.${x}` as never) }))] },
          { name: "building", label: t("common.building"), options: blds.map((b) => ({ value: b.id, label: pickName(locale, b.nameEn, b.nameAr) })) },
        ]}
      />
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.u.id} rowHref={(r) => `/units/${r.u.id}`} rowClassName={(r) => (r.u.status === "under_inspection" ? "bg-bad-50/50" : undefined)} empty={<EmptyState icon={<Home className="size-5" />} title={t("unit.empty_title")} description={t("unit.empty_body")} />} />
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} params={{ q: sp.q, status: sp.status, building: sp.building }} basePath="/units" t={t} />
      <p className="sr-only"><Num>{total}</Num></p>
    </>
  );
}

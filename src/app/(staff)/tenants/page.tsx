import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { Plus, Users } from "lucide-react";
import { contracts, tenants, units } from "@/db/schema";
import { PAGE_SIZE, likeAny } from "@/domain/portfolio";
import { requireStaff } from "@/lib/context";
import { formatPhone } from "@/lib/phone";
import { pickName } from "@/i18n";
import { Badge, EmptyState, Num, PageHeader } from "@/components/ui/display";
import { DataTable, Pagination, parsePage, type Column } from "@/components/ui/data-table";
import { FilterBar } from "@/components/ui/filters";
import { ButtonLink } from "@/components/ui/button";
import { StatusBadge } from "@/components/status";

export const metadata = { title: "Tenants" };

export default async function TenantsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireStaff("tenants:view");
  const sp = await searchParams;
  const { t, db, ctx, locale } = s;
  const page = parsePage(sp.page);
  const conds: SQL[] = [eq(tenants.orgId, ctx.orgId)];
  if (sp.status) conds.push(eq(tenants.status, sp.status as "active"));
  else conds.push(sql`${tenants.status} <> 'archived'`);
  if (sp.q) conds.push(or(ilike(tenants.nameEn, likeAny(sp.q)), ilike(tenants.nameAr, likeAny(sp.q)), ilike(tenants.phone, likeAny(sp.q.replace(/\s/g, ""))), ilike(tenants.idNumber, likeAny(sp.q)))!);
  const where = and(...conds);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(tenants).where(where);
  const rows = await db
    .select({ t: tenants, unit: units.label })
    .from(tenants)
    .leftJoin(contracts, and(eq(contracts.tenantId, tenants.id), eq(contracts.status, "active")))
    .leftJoin(units, eq(units.id, contracts.unitId))
    .where(where)
    .orderBy(desc(tenants.createdAt))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);
  type Row = (typeof rows)[number];
  const columns: Column<Row>[] = [
    { key: "n", header: t("common.tenant"), mobile: "title", cell: (r) => <>{pickName(locale, r.t.nameEn, r.t.nameAr)}</> },
    { key: "u", header: t("common.unit"), mobile: "subtitle", cell: (r) => <>{r.unit ?? "-"}</> },
    { key: "p", header: t("common.phone"), label: t("common.phone"), cell: (r) => <Num>{formatPhone(r.t.phone)}</Num> },
    { key: "id", header: t("tenant.id_number"), label: t("tenant.id_number"), cell: (r) => <Num>{r.t.idNumber}</Num> },
    { key: "a", header: t("tenant.portal"), label: t("tenant.portal"), cell: (r) => (r.t.activatedAt ? <Badge tone="ok" dot>{t("tenant.activated")}</Badge> : <Badge tone="warn" dot>{t("tenant.not_activated")}</Badge>) },
    { key: "s", header: t("common.status"), mobile: "badge", cell: (r) => <StatusBadge kind="tenant" status={r.t.status} t={t} /> },
  ];
  return (
    <>
      <PageHeader title={t("nav.tenants")} description={t("tenant.page_hint")} actions={s.can("tenants:manage") ? <ButtonLink href="/tenants/new"><Plus className="size-4" aria-hidden />{t("tenant.add")}</ButtonLink> : null} />
      <FilterBar searchPlaceholder={t("tenant.search")} hasActive={!!(sp.q || sp.status)} filters={[{ name: "status", label: t("common.status"), options: ["active", "former", "archived"].map((x) => ({ value: x, label: t(`tenant.status.${x}` as never) })) }]} />
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.t.id} rowHref={(r) => `/tenants/${r.t.id}`} empty={<EmptyState icon={<Users className="size-5" />} title={t("tenant.empty_title")} description={t("tenant.empty_body")} />} />
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} params={{ q: sp.q, status: sp.status }} basePath="/tenants" t={t} />
    </>
  );
}

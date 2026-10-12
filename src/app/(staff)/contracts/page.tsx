import { and, asc, desc, eq, ilike, isNull, lte, or, sql, type SQL } from "drizzle-orm";
import { FileText, Plus } from "lucide-react";
import { buildings, contracts, tenants, units } from "@/db/schema";
import { PAGE_SIZE, likeAny } from "@/domain/portfolio";
import { requireStaff } from "@/lib/context";
import { addDays, diffDays, formatRange, todayISO } from "@/lib/dates";
import { pickName } from "@/i18n";
import { Badge, EmptyState, Money, Num, PageHeader } from "@/components/ui/display";
import { DataTable, Pagination, parsePage, type Column } from "@/components/ui/data-table";
import { FilterBar, Tabs } from "@/components/ui/filters";
import { ButtonLink } from "@/components/ui/button";
import { StatusBadge } from "@/components/status";
import { organisations } from "@/db/schema";

export const metadata = { title: "Contracts" };

export default async function ContractsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireStaff("contracts:view");
  const sp = await searchParams;
  const { t, db, ctx, locale } = s;
  const today = todayISO();
  const [org] = await db.select().from(organisations).where(eq(organisations.id, ctx.orgId));
  const tab = sp.tab ?? "active";
  const page = parsePage(sp.page);
  const conds: SQL[] = [eq(contracts.orgId, ctx.orgId)];
  if (tab === "active") conds.push(eq(contracts.status, "active"));
  if (tab === "upcoming") conds.push(eq(contracts.status, "pending"));
  if (tab === "ended") conds.push(eq(contracts.status, "ended"));
  if (tab === "expiring") conds.push(eq(contracts.status, "active"), lte(contracts.endDate, addDays(today, org.contractAlertDays)), isNull(contracts.renewedToId), isNull(contracts.noticeGivenOn));
  if (sp.q) conds.push(or(ilike(contracts.reference, likeAny(sp.q)), ilike(tenants.nameEn, likeAny(sp.q)), ilike(tenants.nameAr, likeAny(sp.q)), ilike(units.label, likeAny(sp.q)))!);
  const where = and(...conds);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(contracts).innerJoin(units, eq(units.id, contracts.unitId)).innerJoin(tenants, eq(tenants.id, contracts.tenantId)).where(where);
  const rows = await db
    .select({ c: contracts, unit: units.label, building: buildings.nameEn, buildingAr: buildings.nameAr, tenant: tenants.nameEn, tenantAr: tenants.nameAr })
    .from(contracts)
    .innerJoin(units, eq(units.id, contracts.unitId))
    .innerJoin(buildings, eq(buildings.id, units.buildingId))
    .innerJoin(tenants, eq(tenants.id, contracts.tenantId))
    .where(where)
    .orderBy(tab === "ended" ? desc(contracts.endDate) : asc(contracts.endDate))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);
  const counts = await db.select({ status: contracts.status, n: sql<number>`count(*)::int` }).from(contracts).where(eq(contracts.orgId, ctx.orgId)).groupBy(contracts.status);
  const n = (st: string) => counts.find((c) => c.status === st)?.n ?? 0;
  const [{ exp }] = await db.select({ exp: sql<number>`count(*)::int` }).from(contracts).where(and(eq(contracts.orgId, ctx.orgId), eq(contracts.status, "active"), lte(contracts.endDate, addDays(today, org.contractAlertDays)), isNull(contracts.renewedToId), isNull(contracts.noticeGivenOn)));
  type Row = (typeof rows)[number];
  const columns: Column<Row>[] = [
    { key: "r", header: "#", mobile: "title", cell: (r) => <Num>{r.c.reference}</Num> },
    { key: "t", header: t("common.tenant"), mobile: "subtitle", cell: (r) => <>{pickName(locale, r.tenant, r.tenantAr)} · {r.unit}</> },
    { key: "b", header: t("common.building"), label: t("common.building"), cell: (r) => <>{pickName(locale, r.building, r.buildingAr)}</> },
    { key: "p", header: t("contract.term"), label: t("contract.term"), cell: (r) => <>{formatRange(r.c.startDate, r.c.endDate, locale)}</> },
    { key: "m", header: t("common.rent"), label: t("common.rent"), align: "end", cell: (r) => <Money baisa={r.c.monthlyRentBaisa} locale={locale} /> },
    { key: "s", header: t("common.status"), mobile: "badge", cell: (r) => {
      const days = diffDays(today, r.c.endDate);
      return <div className="flex flex-wrap gap-1"><StatusBadge kind="contract" status={r.c.status} t={t} />{r.c.noticeGivenOn && r.c.status === "active" ? <Badge tone="warn">{t("unit.status.notice_given")}</Badge> : r.c.status === "active" && !r.c.renewedToId && days <= org.contractAlertDays ? <Badge tone={days <= 30 ? "bad" : "warn"}>{t("common.day_left", { n: days })}</Badge> : null}</div>;
    } },
  ];
  return (
    <>
      <PageHeader title={t("nav.contracts")} description={t("contract.page_hint")} actions={s.can("contracts:manage") ? <ButtonLink href="/contracts/new"><Plus className="size-4" aria-hidden />{t("contract.new")}</ButtonLink> : null} />
      <Tabs basePath="/contracts" active={tab} tabs={[
        { value: "active", label: t("contract.status.active"), count: n("active") },
        { value: "expiring", label: t("contract.tab.expiring"), count: exp, tone: "warn" },
        { value: "upcoming", label: t("contract.status.pending"), count: n("pending") },
        { value: "ended", label: t("contract.status.ended"), count: n("ended") },
        { value: "all", label: t("common.all") },
      ]} />
      <FilterBar searchPlaceholder={t("contract.search")} hasActive={!!sp.q} />
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.c.id} rowHref={(r) => `/contracts/${r.c.id}`} empty={<EmptyState icon={<FileText className="size-5" />} title={t("contract.empty_title")} description={t("contract.empty_body")} />} />
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} params={{ tab, q: sp.q }} basePath="/contracts" t={t} />
    </>
  );
}

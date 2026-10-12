import { and, asc, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { Wallet } from "lucide-react";
import { buildings, cheques, tenants, units } from "@/db/schema";
import { promoteDueCheques } from "@/domain/cheques";
import { likeAny, PAGE_SIZE } from "@/domain/portfolio";
import { requireStaff } from "@/lib/context";
import { formatDate } from "@/lib/dates";
import { pickName } from "@/i18n";
import { Badge, EmptyState, Money, Num, PageHeader } from "@/components/ui/display";
import { DataTable, Pagination, parsePage, type Column } from "@/components/ui/data-table";
import { FilterBar, Tabs } from "@/components/ui/filters";
import { StatusBadge } from "@/components/status";
import { ChequeActions } from "./cheque-actions";

export const metadata = { title: "Cheques" };

const TABS: Record<string, string[]> = {
  due: ["due"],
  deposited: ["deposited"],
  bounced: ["bounced", "follow_up"],
  upcoming: ["received"],
  collected: ["collected"],
  closed: ["written_off", "returned"],
};

export default async function ChequesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireStaff("cheques:view");
  const sp = await searchParams;
  const { t, db, ctx, locale } = s;
  await promoteDueCheques(db, ctx.orgId);

  const counts = await db
    .select({ status: cheques.status, n: sql<number>`count(*)::int` })
    .from(cheques)
    .where(eq(cheques.orgId, ctx.orgId))
    .groupBy(cheques.status);
  const countOf = (keys: string[]) => counts.filter((c) => keys.includes(c.status)).reduce((a, c) => a + c.n, 0);
  const tab = sp.tab && (sp.tab in TABS || sp.tab === "all") ? sp.tab : countOf(TABS.bounced) > 0 ? "bounced" : "due";
  const page = parsePage(sp.page);

  const conds: SQL[] = [eq(cheques.orgId, ctx.orgId)];
  if (tab !== "all") conds.push(inArray(cheques.status, TABS[tab] as never[]));
  if (sp.q) conds.push(or(ilike(cheques.chequeNumber, likeAny(sp.q)), ilike(tenants.nameEn, likeAny(sp.q)), ilike(tenants.nameAr, likeAny(sp.q)), ilike(units.label, likeAny(sp.q)), ilike(cheques.bank, likeAny(sp.q)))!);
  if (sp.from) conds.push(sql`${cheques.chequeDate} >= ${sp.from}`);
  if (sp.to) conds.push(sql`${cheques.chequeDate} <= ${sp.to}`);
  const where = and(...conds);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(cheques)
    .innerJoin(units, eq(units.id, cheques.unitId))
    .innerJoin(tenants, eq(tenants.id, cheques.tenantId))
    .where(where);
  const rows = await db
    .select({ c: cheques, unit: units.label, building: buildings.nameEn, buildingAr: buildings.nameAr, tenant: tenants.nameEn, tenantAr: tenants.nameAr })
    .from(cheques)
    .innerJoin(units, eq(units.id, cheques.unitId))
    .innerJoin(buildings, eq(buildings.id, units.buildingId))
    .innerJoin(tenants, eq(tenants.id, cheques.tenantId))
    .where(where)
    .orderBy(tab === "collected" ? desc(cheques.chequeDate) : asc(cheques.chequeDate))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  type Row = (typeof rows)[number];
  const columns: Column<Row>[] = [
    { key: "tenant", header: t("common.tenant"), mobile: "title", cell: (r) => <>{pickName(locale, r.tenant, r.tenantAr)}</> },
    { key: "unit", header: t("common.unit"), mobile: "subtitle", cell: (r) => <>{r.unit} · {pickName(locale, r.building, r.buildingAr)}</> },
    { key: "no", header: "#", label: "#", cell: (r) => <><Num>{r.c.chequeNumber}</Num> <span className="text-ink-3">{r.c.bank}</span></> },
    { key: "date", header: t("common.date"), label: t("common.date"), cell: (r) => <>{formatDate(r.c.chequeDate, locale)}</> },
    { key: "amount", header: t("common.amount"), label: t("common.amount"), align: "end", cell: (r) => <Money baisa={r.c.amountBaisa} locale={locale} strong /> },
    { key: "status", header: t("common.status"), mobile: "badge", cell: (r) => <div className="space-y-1"><StatusBadge kind="cheque" status={r.c.status} t={t} />{r.c.bounceReason && ["bounced", "follow_up"].includes(r.c.status) ? <p className="max-w-48 text-[12px] text-bad-700">{r.c.bounceReason}</p> : null}</div> },
    { key: "act", header: <span className="sr-only">{t("common.actions")}</span>, mobile: "actions", align: "end", cell: (r) => <ChequeActions id={r.c.id} status={r.c.status} canProcess={s.can("cheques:process")} canWriteOff={s.can("cheques:writeoff")} number={r.c.chequeNumber} hasScan={!!r.c.scanFileId} scanId={r.c.scanFileId} /> },
  ];

  const tabDefs = [
    { value: "bounced", label: t("cheque.tab.bounced"), count: countOf(TABS.bounced), tone: "bad" as const },
    { value: "due", label: t("cheque.status.due"), count: countOf(TABS.due), tone: "warn" as const },
    { value: "deposited", label: t("cheque.status.deposited"), count: countOf(TABS.deposited) },
    { value: "upcoming", label: t("cheque.tab.upcoming"), count: countOf(TABS.upcoming) },
    { value: "collected", label: t("cheque.status.collected"), count: countOf(TABS.collected) },
    { value: "closed", label: t("cheque.tab.closed"), count: countOf(TABS.closed) },
    { value: "all", label: t("common.all") },
  ];

  return (
    <>
      <PageHeader title={t("nav.cheques")} description={t("cheque.page_hint")} />
      <Tabs tabs={tabDefs} active={tab} basePath="/cheques" />
      <FilterBar searchPlaceholder={t("cheque.search")} hasActive={!!(sp.q || sp.from || sp.to)} dates />
      {tab === "bounced" && total > 0 ? <Badge tone="bad" className="mb-3">{t("cheque.bounced_hint")}</Badge> : null}
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.c.id}
        rowClassName={(r) => (["bounced", "follow_up"].includes(r.c.status) ? "bg-bad-50/50" : sp.focus === r.c.id ? "bg-brass-50" : undefined)}
        empty={<EmptyState icon={<Wallet className="size-5" />} title={t("cheque.empty_title")} description={t("cheque.empty_body")} />}
      />
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} params={{ tab, q: sp.q, from: sp.from, to: sp.to }} basePath="/cheques" t={t} />
    </>
  );
}

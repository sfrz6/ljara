import Link from "next/link";
import { and, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { Plus, Wrench } from "lucide-react";
import { buildings, maintenanceCategories, maintenanceRequests, units, users } from "@/db/schema";
import { likeAny, PAGE_SIZE } from "@/domain/portfolio";
import { repeatFailures } from "@/domain/maintenance";
import { requireStaff } from "@/lib/context";
import { formatDate } from "@/lib/dates";
import { pickName } from "@/i18n";
import { Badge, Card, CardHeader, EmptyState, Num, PageHeader } from "@/components/ui/display";
import { DataTable, Pagination, parsePage, type Column } from "@/components/ui/data-table";
import { FilterBar } from "@/components/ui/filters";
import { ButtonLink } from "@/components/ui/button";
import { StatusBadge } from "@/components/status";
import { MAINTENANCE_STATES } from "@/domain/machines";

export const metadata = { title: "Maintenance" };

export default async function MaintenancePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireStaff("maintenance:view");
  const sp = await searchParams;
  const { t, db, ctx, locale } = s;
  const page = parsePage(sp.page);
  const conds: SQL[] = [eq(maintenanceRequests.orgId, ctx.orgId)];
  if (sp.status === "open") conds.push(sql`${maintenanceRequests.status} in ('submitted','seen','assigned','in_progress','completed')`);
  else if (sp.status) conds.push(eq(maintenanceRequests.status, sp.status as "submitted"));
  if (sp.building) conds.push(eq(maintenanceRequests.buildingId, sp.building));
  if (sp.category) conds.push(eq(maintenanceRequests.categoryId, sp.category));
  if (sp.mine === "1") conds.push(eq(maintenanceRequests.assignedToUserId, s.user.id));
  if (sp.q) conds.push(or(ilike(maintenanceRequests.title, likeAny(sp.q)), ilike(maintenanceRequests.reference, likeAny(sp.q)), ilike(units.label, likeAny(sp.q)))!);
  const where = and(...conds);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(maintenanceRequests).innerJoin(units, eq(units.id, maintenanceRequests.unitId)).where(where);
  const rows = await db
    .select({ r: maintenanceRequests, unit: units.label, building: buildings.nameEn, buildingAr: buildings.nameAr, cat: maintenanceCategories.nameEn, catAr: maintenanceCategories.nameAr, tech: users.name })
    .from(maintenanceRequests)
    .innerJoin(units, eq(units.id, maintenanceRequests.unitId))
    .innerJoin(buildings, eq(buildings.id, maintenanceRequests.buildingId))
    .leftJoin(maintenanceCategories, eq(maintenanceCategories.id, maintenanceRequests.categoryId))
    .leftJoin(users, eq(users.id, maintenanceRequests.assignedToUserId))
    .where(where)
    .orderBy(desc(maintenanceRequests.priority), desc(maintenanceRequests.createdAt))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);
  const [blds, cats, repeats] = await Promise.all([
    db.select().from(buildings).where(eq(buildings.orgId, ctx.orgId)),
    db.select().from(maintenanceCategories).where(eq(maintenanceCategories.orgId, ctx.orgId)),
    s.can("maintenance:manage") ? repeatFailures(db, ctx.orgId) : Promise.resolve([]),
  ]);

  type Row = (typeof rows)[number];
  const columns: Column<Row>[] = [
    { key: "t", header: t("maint.title"), mobile: "title", cell: (r) => <span className="flex items-center gap-2">{r.r.priority === "urgent" ? <Badge tone="bad">{t("priority.urgent")}</Badge> : null}{r.r.title}</span> },
    { key: "u", header: t("common.unit"), mobile: "subtitle", cell: (r) => <>{r.unit} · {pickName(locale, r.building, r.buildingAr)}</> },
    { key: "ref", header: "#", label: "#", cell: (r) => <Num>{r.r.reference}</Num> },
    { key: "cat", header: t("maint.category"), label: t("maint.category"), cell: (r) => <>{r.cat ? pickName(locale, r.cat, r.catAr) : "-"}</> },
    { key: "tech", header: t("maint.technician"), label: t("maint.technician"), cell: (r) => <>{r.tech ?? "-"}</> },
    { key: "d", header: t("common.created"), label: t("common.created"), cell: (r) => <>{formatDate(r.r.createdAt, locale)}</> },
    { key: "s", header: t("common.status"), mobile: "badge", cell: (r) => <StatusBadge kind="maint" status={r.r.status} t={t} /> },
  ];

  return (
    <>
      <PageHeader title={t("nav.maintenance")} description={t("maint.page_hint")} actions={s.can("maintenance:create") ? <ButtonLink href="/maintenance/new"><Plus className="size-4" aria-hidden />{t("maint.new")}</ButtonLink> : null} />
      <FilterBar
        searchPlaceholder={t("maint.search")}
        hasActive={!!(sp.q || sp.status || sp.building || sp.category || sp.mine)}
        filters={[
          { name: "status", label: t("common.status"), options: [{ value: "open", label: t("maint.open") }, ...MAINTENANCE_STATES.map((st) => ({ value: st, label: t(`maint.status.${st}` as never) }))] },
          { name: "building", label: t("common.building"), options: blds.map((b) => ({ value: b.id, label: pickName(locale, b.nameEn, b.nameAr) })) },
          { name: "category", label: t("maint.category"), options: cats.map((c) => ({ value: c.id, label: pickName(locale, c.nameEn, c.nameAr) })) },
          ...(s.role === "maintenance" ? [{ name: "mine", label: t("maint.assigned_to_me"), options: [{ value: "1", label: t("common.yes") }] }] : []),
        ]}
      />
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.r.id} rowHref={(r) => `/maintenance/${r.r.id}`} empty={<EmptyState icon={<Wrench className="size-5" />} title={t("maint.empty_title")} description={t("maint.empty_body")} />} />
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} params={{ q: sp.q, status: sp.status, building: sp.building, category: sp.category, mine: sp.mine }} basePath="/maintenance" t={t} />
      {repeats.length > 0 ? (
        <Card className="mt-8">
          <CardHeader title={t("maint.repeat_title")} description={t("maint.repeat_hint")} />
          <ul className="divide-y divide-line">
            {repeats.map((r) => (
              <li key={`${r.unitId}-${r.categoryKey}`}>
                <Link href={`/units/${r.unitId}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-2 md:px-5">
                  <span className="text-[14px] font-medium">{r.unitLabel} · {r.buildingName}<span className="block text-[12.5px] font-normal text-ink-3">{pickName(locale, r.categoryName, r.categoryNameAr)}</span></span>
                  <Badge tone="warn">{t("maint.repeat_count", { n: r.count })}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}

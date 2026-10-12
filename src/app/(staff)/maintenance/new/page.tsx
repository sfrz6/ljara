import { and, eq, isNull } from "drizzle-orm";
import { buildings, contracts, maintenanceCategories, tenants, units } from "@/db/schema";
import { requireStaff } from "@/lib/context";
import { pickName } from "@/i18n";
import { PageHeader } from "@/components/ui/display";
import { NewRequestForm } from "./form";

export default async function NewRequestPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireStaff("maintenance:create");
  const sp = await searchParams;
  const { t, db, ctx, locale } = s;
  const list = await db
    .select({ id: units.id, label: units.label, building: buildings.nameEn, buildingAr: buildings.nameAr, tenantId: tenants.id, tenant: tenants.nameEn, tenantAr: tenants.nameAr })
    .from(units)
    .innerJoin(buildings, eq(buildings.id, units.buildingId))
    .leftJoin(contracts, and(eq(contracts.unitId, units.id), eq(contracts.status, "active")))
    .leftJoin(tenants, eq(tenants.id, contracts.tenantId))
    .where(and(eq(units.orgId, ctx.orgId), isNull(units.archivedAt)))
    .orderBy(buildings.nameEn, units.label);
  const cats = await db.select().from(maintenanceCategories).where(and(eq(maintenanceCategories.orgId, ctx.orgId), eq(maintenanceCategories.active, true)));
  return (
    <>
      <PageHeader title={t("maint.new")} description={t("maint.new_hint")} breadcrumbs={[{ href: "/maintenance", label: t("nav.maintenance") }, { label: t("maint.new") }]} />
      <div className="max-w-2xl">
        <NewRequestForm
          defaultUnit={sp.unit}
          units={list.map((u) => ({ id: u.id, label: `${u.label} · ${pickName(locale, u.building, u.buildingAr)}${u.tenant ? ` · ${pickName(locale, u.tenant, u.tenantAr)}` : ""}`, tenantId: u.tenantId }))}
          categories={cats.map((c) => ({ id: c.id, label: pickName(locale, c.nameEn, c.nameAr) }))}
        />
      </div>
    </>
  );
}

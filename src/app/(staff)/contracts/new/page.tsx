import { and, eq, isNull } from "drizzle-orm";
import { buildings, contracts, organisations, owners, tenants, units } from "@/db/schema";
import { resolveRentCap } from "@/domain/finance";
import { requireStaff } from "@/lib/context";
import { addDays, addMonths, todayISO } from "@/lib/dates";
import { baisaToDecimalString } from "@/lib/money";
import { pickName } from "@/i18n";
import { PageHeader } from "@/components/ui/display";
import { ContractWizard } from "./wizard";

export default async function NewContractPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const s = await requireStaff("contracts:manage");
  const sp = await searchParams;
  const { t, db, ctx, locale } = s;
  const [org] = await db.select().from(organisations).where(eq(organisations.id, ctx.orgId));

  let renew: { id: string; unitId: string; tenantId: string; rent: number; end: string; electricity: string; water: string } | null = null;
  if (sp.renew) {
    const [c] = await db.select().from(contracts).where(and(eq(contracts.id, sp.renew), eq(contracts.orgId, ctx.orgId)));
    if (c && !c.renewedToId) renew = { id: c.id, unitId: c.unitId, tenantId: c.tenantId, rent: c.monthlyRentBaisa, end: c.endDate, electricity: c.electricityAccount ?? "", water: c.waterAccount ?? "" };
  }

  const unitRows = await db
    .select({ u: units, building: buildings.nameEn, buildingAr: buildings.nameAr, owner: owners })
    .from(units)
    .innerJoin(buildings, eq(buildings.id, units.buildingId))
    .innerJoin(owners, eq(owners.id, units.ownerId))
    .where(and(eq(units.orgId, ctx.orgId), isNull(units.archivedAt), renew ? eq(units.id, renew.unitId) : eq(units.status, "available")));
  const tenantRows = await db.select().from(tenants).where(and(eq(tenants.orgId, ctx.orgId), renew ? eq(tenants.id, renew.tenantId) : eq(tenants.status, "active")));

  const unitOptions = unitRows.map((r) => ({
    id: r.u.id,
    label: `${r.u.label} · ${pickName(locale, r.building, r.buildingAr)}`,
    rent: baisaToDecimalString(renew ? renew.rent : r.u.rentBaisa),
    capBp: resolveRentCap({ unitCapBp: r.u.rentIncreaseCapBp, ownerCapBp: r.owner.rentIncreaseCapBp, orgCapBp: org.rentIncreaseCapBp }).capBp,
    capLevel: resolveRentCap({ unitCapBp: r.u.rentIncreaseCapBp, ownerCapBp: r.owner.rentIncreaseCapBp, orgCapBp: org.rentIncreaseCapBp }).level,
  }));
  const start = renew ? addDays(renew.end, 1) : todayISO();
  return (
    <>
      <PageHeader title={renew ? t("contract.renew_title") : t("contract.new")} description={renew ? t("contract.renew_hint") : t("contract.new_hint")} breadcrumbs={[{ href: "/contracts", label: t("nav.contracts") }, { label: renew ? t("contract.renew_title") : t("contract.new") }]} />
      <ContractWizard
        units={unitOptions}
        tenants={tenantRows.map((x) => ({ id: x.id, label: `${pickName(locale, x.nameEn, x.nameAr)} · ${x.idNumber}` }))}
        defaults={{ unitId: renew?.unitId ?? sp.unit ?? "", tenantId: renew?.tenantId ?? sp.tenant ?? "", start, end: addDays(addMonths(start, 12), -1), previousContractId: renew?.id ?? "", currentRent: renew ? baisaToDecimalString(renew.rent) : "", electricityAccount: renew?.electricity ?? "", waterAccount: renew?.water ?? "" }}
        lockParties={!!renew}
      />
    </>
  );
}

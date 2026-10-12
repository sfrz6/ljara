import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import {
  buildings,
  cheques,
  contracts,
  inspections,
  maintenanceRequests,
  organisations,
  owners,
  payments,
  receipts,
  scheduleItems,
  tenants,
  units,
} from "@/db/schema";
import { addDays, endOfMonth, startOfMonth, todayISO } from "@/lib/dates";
import { expiringContracts } from "./contracts";
import { promoteDueCheques } from "./cheques";

const num = (col: unknown) => sql<number>`coalesce(sum(${col as never}), 0)::bigint`.mapWith(Number);

export async function manager(q: DB, orgId: string, today = todayISO()) {
  await promoteDueCheques(q, orgId, today);
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);
  const [org] = await q.select().from(organisations).where(eq(organisations.id, orgId));

  const [collected] = await q
    .select({ v: num(payments.amountBaisa) })
    .from(payments)
    .where(and(eq(payments.orgId, orgId), eq(payments.status, "posted"), gte(payments.paidOn, monthStart), lte(payments.paidOn, monthEnd)));

  const [overdue] = await q
    .select({ v: num(scheduleItems.amountBaisa), n: sql<number>`count(*)::int` })
    .from(scheduleItems)
    .where(and(eq(scheduleItems.orgId, orgId), eq(scheduleItems.status, "open"), lt(scheduleItems.dueDate, today)));

  const [dueSoon] = await q
    .select({ v: num(scheduleItems.amountBaisa), n: sql<number>`count(*)::int` })
    .from(scheduleItems)
    .where(
      and(
        eq(scheduleItems.orgId, orgId),
        eq(scheduleItems.status, "open"),
        gte(scheduleItems.dueDate, today),
        lte(scheduleItems.dueDate, addDays(today, 30)),
      ),
    );

  const [expected] = await q
    .select({ v: num(scheduleItems.amountBaisa) })
    .from(scheduleItems)
    .where(
      and(
        eq(scheduleItems.orgId, orgId),
        inArray(scheduleItems.status, ["open", "paid"]),
        gte(scheduleItems.dueDate, monthStart),
        lte(scheduleItems.dueDate, monthEnd),
      ),
    );

  const unitCounts = await q
    .select({ status: units.status, n: sql<number>`count(*)::int` })
    .from(units)
    .where(and(eq(units.orgId, orgId), isNull(units.archivedAt)))
    .groupBy(units.status);
  const byStatus = Object.fromEntries(unitCounts.map((r) => [r.status, r.n])) as Record<string, number>;
  const totalUnits = unitCounts.reduce((a, r) => a + r.n, 0);
  const occupiedUnits = (byStatus.occupied ?? 0) + (byStatus.notice_given ?? 0);

  const bounced = await q
    .select({ c: cheques, unit: units.label, tenant: tenants.nameEn, tenantAr: tenants.nameAr })
    .from(cheques)
    .innerJoin(units, eq(units.id, cheques.unitId))
    .innerJoin(tenants, eq(tenants.id, cheques.tenantId))
    .where(and(eq(cheques.orgId, orgId), inArray(cheques.status, ["bounced", "follow_up"])))
    .orderBy(desc(cheques.bouncedOn));

  const [dueCheques] = await q
    .select({ n: sql<number>`count(*)::int`, v: num(cheques.amountBaisa) })
    .from(cheques)
    .where(and(eq(cheques.orgId, orgId), eq(cheques.status, "due")));

  const underInspection = await q
    .select({ unit: units, building: buildings.nameEn, buildingAr: buildings.nameAr })
    .from(units)
    .innerJoin(buildings, eq(buildings.id, units.buildingId))
    .where(and(eq(units.orgId, orgId), inArray(units.status, ["under_inspection", "inspected", "vacated"]), isNull(units.archivedAt)))
    .orderBy(asc(units.statusSince));

  const expiring = await expiringContracts(q, orgId, org.contractAlertDays, today);
  const expiringDetail = [];
  for (const c of expiring.slice(0, 6)) {
    const [row] = await q
      .select({ unit: units.label, tenant: tenants.nameEn, tenantAr: tenants.nameAr })
      .from(units)
      .innerJoin(tenants, eq(tenants.id, c.tenantId))
      .where(eq(units.id, c.unitId));
    expiringDetail.push({ ...c, unit: row?.unit ?? "", tenant: row?.tenant ?? "", tenantAr: row?.tenantAr ?? null });
  }

  const maintenance = await q
    .select({ status: maintenanceRequests.status, n: sql<number>`count(*)::int`, oldest: sql<Date>`min(${maintenanceRequests.createdAt})` })
    .from(maintenanceRequests)
    .where(and(eq(maintenanceRequests.orgId, orgId), inArray(maintenanceRequests.status, ["submitted", "seen", "assigned", "in_progress", "completed"])))
    .groupBy(maintenanceRequests.status);

  const awaitingCost = await q
    .select({ n: sql<number>`count(*)::int` })
    .from(maintenanceRequests)
    .where(and(eq(maintenanceRequests.orgId, orgId), eq(maintenanceRequests.status, "completed")));

  const perBuilding = await buildingCollection(q, orgId, today);

  const perOwner = await q
    .select({ ownerId: owners.id, name: owners.nameEn, nameAr: owners.nameAr, collected: num(payments.amountBaisa) })
    .from(owners)
    .leftJoin(
      payments,
      and(eq(payments.ownerId, owners.id), eq(payments.status, "posted"), gte(payments.paidOn, monthStart), lte(payments.paidOn, monthEnd)),
    )
    .where(and(eq(owners.orgId, orgId), isNull(owners.archivedAt)))
    .groupBy(owners.id, owners.nameEn, owners.nameAr)
    .orderBy(desc(num(payments.amountBaisa)));

  return {
    monthStart,
    monthEnd,
    collectedBaisa: collected.v,
    expectedBaisa: expected.v,
    overdueBaisa: overdue.v,
    overdueCount: overdue.n,
    dueSoonBaisa: dueSoon.v,
    dueSoonCount: dueSoon.n,
    totalUnits,
    occupiedUnits,
    vacantUnits: byStatus.available ?? 0,
    unitsByStatus: byStatus,
    bounced,
    dueChequeCount: dueCheques.n,
    dueChequeBaisa: dueCheques.v,
    underInspection,
    expiring: expiringDetail,
    expiringCount: expiring.length,
    maintenance,
    awaitingCostCount: awaitingCost[0]?.n ?? 0,
    perBuilding,
    perOwner,
  };
}

/** Collected against expected for the current month, plus overdue, per building (CR-6.5). */
export async function buildingCollection(q: DB, orgId: string, today = todayISO()) {
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);
  return q
    .select({
      buildingId: buildings.id,
      name: buildings.nameEn,
      nameAr: buildings.nameAr,
      expected: sql<number>`coalesce(sum(${scheduleItems.amountBaisa}) filter (where ${scheduleItems.status} in ('open','paid') and ${scheduleItems.dueDate} between ${monthStart} and ${monthEnd}), 0)::bigint`.mapWith(Number),
      collected: sql<number>`coalesce(sum(${scheduleItems.amountBaisa}) filter (where ${scheduleItems.status} = 'paid' and ${scheduleItems.dueDate} between ${monthStart} and ${monthEnd}), 0)::bigint`.mapWith(Number),
      overdue: sql<number>`coalesce(sum(${scheduleItems.amountBaisa}) filter (where ${scheduleItems.status} = 'open' and ${scheduleItems.dueDate} < ${today}), 0)::bigint`.mapWith(Number),
    })
    .from(buildings)
    .innerJoin(units, eq(units.buildingId, buildings.id))
    .leftJoin(scheduleItems, eq(scheduleItems.unitId, units.id))
    .where(and(eq(buildings.orgId, orgId), isNull(buildings.archivedAt)))
    .groupBy(buildings.id, buildings.nameEn, buildings.nameAr)
    .orderBy(asc(buildings.nameEn));
}

export async function accounts(q: DB, orgId: string, today = todayISO()) {
  await promoteDueCheques(q, orgId, today);
  const monthStart = startOfMonth(today);
  const monthEnd = endOfMonth(today);
  const base = (statuses: ("due" | "deposited" | "bounced" | "follow_up")[]) =>
    q
      .select({ c: cheques, unit: units.label, tenant: tenants.nameEn, tenantAr: tenants.nameAr })
      .from(cheques)
      .innerJoin(units, eq(units.id, cheques.unitId))
      .innerJoin(tenants, eq(tenants.id, cheques.tenantId))
      .where(and(eq(cheques.orgId, orgId), inArray(cheques.status, statuses)))
      .orderBy(asc(cheques.chequeDate));
  const [due, deposited, bounced] = await Promise.all([base(["due"]), base(["deposited"]), base(["bounced", "follow_up"])]);
  const [collected] = await q
    .select({ v: num(payments.amountBaisa), n: sql<number>`count(*)::int` })
    .from(payments)
    .where(and(eq(payments.orgId, orgId), eq(payments.status, "posted"), gte(payments.paidOn, monthStart), lte(payments.paidOn, monthEnd)));
  const [todayCollected] = await q
    .select({ v: num(payments.amountBaisa), n: sql<number>`count(*)::int` })
    .from(payments)
    .where(and(eq(payments.orgId, orgId), eq(payments.status, "posted"), eq(payments.paidOn, today)));
  const overdueNoCheque = await q
    .select({ item: scheduleItems, unit: units.label, tenant: tenants.nameEn, tenantAr: tenants.nameAr })
    .from(scheduleItems)
    .innerJoin(units, eq(units.id, scheduleItems.unitId))
    .innerJoin(tenants, eq(tenants.id, scheduleItems.tenantId))
    .where(
      and(
        eq(scheduleItems.orgId, orgId),
        eq(scheduleItems.status, "open"),
        lte(scheduleItems.dueDate, today),
        sql`not exists (select 1 from cheques c where c.schedule_item_id = ${scheduleItems.id} and c.status in ('received','due','deposited','bounced','follow_up'))`,
      ),
    )
    .orderBy(asc(scheduleItems.dueDate))
    .limit(10);
  const recentReceipts = await q
    .select()
    .from(receipts)
    .where(eq(receipts.orgId, orgId))
    .orderBy(desc(receipts.issuedAt))
    .limit(5);
  return {
    due,
    deposited,
    bounced,
    collectedMonthBaisa: collected.v,
    collectedMonthCount: collected.n,
    collectedTodayBaisa: todayCollected.v,
    collectedTodayCount: todayCollected.n,
    overdueNoCheque,
    recentReceipts,
  };
}

export async function maintenance(q: DB, orgId: string, userId: string) {
  const mine = await q
    .select({ r: maintenanceRequests, unit: units.label, building: buildings.nameEn })
    .from(maintenanceRequests)
    .innerJoin(units, eq(units.id, maintenanceRequests.unitId))
    .innerJoin(buildings, eq(buildings.id, maintenanceRequests.buildingId))
    .where(
      and(
        eq(maintenanceRequests.orgId, orgId),
        eq(maintenanceRequests.assignedToUserId, userId),
        inArray(maintenanceRequests.status, ["assigned", "in_progress", "completed"]),
      ),
    )
    .orderBy(desc(maintenanceRequests.priority), asc(maintenanceRequests.createdAt));
  const unassigned = await q
    .select({ r: maintenanceRequests, unit: units.label, building: buildings.nameEn })
    .from(maintenanceRequests)
    .innerJoin(units, eq(units.id, maintenanceRequests.unitId))
    .innerJoin(buildings, eq(buildings.id, maintenanceRequests.buildingId))
    .where(and(eq(maintenanceRequests.orgId, orgId), inArray(maintenanceRequests.status, ["submitted", "seen"])))
    .orderBy(asc(maintenanceRequests.createdAt));
  const pendingInspections = await q
    .select({ i: inspections, unit: units.label, building: buildings.nameEn })
    .from(inspections)
    .innerJoin(units, eq(units.id, inspections.unitId))
    .innerJoin(buildings, eq(buildings.id, units.buildingId))
    .where(and(eq(inspections.orgId, orgId), eq(inspections.status, "pending")))
    .orderBy(asc(inspections.createdAt));
  const [done] = await q
    .select({ n: sql<number>`count(*)::int` })
    .from(maintenanceRequests)
    .where(and(eq(maintenanceRequests.orgId, orgId), eq(maintenanceRequests.assignedToUserId, userId), eq(maintenanceRequests.status, "posted")));
  return { mine, unassigned, pendingInspections, completedCount: done.n };
}

export async function contractsDash(q: DB, orgId: string, today = todayISO()) {
  const [org] = await q.select().from(organisations).where(eq(organisations.id, orgId));
  const expiring = await expiringContracts(q, orgId, org.contractAlertDays, today);
  const detail = [];
  for (const c of expiring) {
    const [row] = await q
      .select({ unit: units.label, tenant: tenants.nameEn, tenantAr: tenants.nameAr })
      .from(units)
      .innerJoin(tenants, eq(tenants.id, c.tenantId))
      .where(eq(units.id, c.unitId));
    detail.push({ ...c, unit: row?.unit ?? "", tenant: row?.tenant ?? "", tenantAr: row?.tenantAr ?? null });
  }
  const notices = await q
    .select({ c: contracts, unit: units.label, tenant: tenants.nameEn, tenantAr: tenants.nameAr })
    .from(contracts)
    .innerJoin(units, eq(units.id, contracts.unitId))
    .innerJoin(tenants, eq(tenants.id, contracts.tenantId))
    .where(and(eq(contracts.orgId, orgId), eq(contracts.status, "active"), sql`${contracts.noticeGivenOn} is not null`))
    .orderBy(asc(contracts.moveOutDate));
  const upcoming = await q
    .select({ c: contracts, unit: units.label, tenant: tenants.nameEn, tenantAr: tenants.nameAr })
    .from(contracts)
    .innerJoin(units, eq(units.id, contracts.unitId))
    .innerJoin(tenants, eq(tenants.id, contracts.tenantId))
    .where(and(eq(contracts.orgId, orgId), eq(contracts.status, "pending")))
    .orderBy(asc(contracts.startDate));
  const vacant = await q
    .select({ unit: units, building: buildings.nameEn, buildingAr: buildings.nameAr })
    .from(units)
    .innerJoin(buildings, eq(buildings.id, units.buildingId))
    .where(and(eq(units.orgId, orgId), eq(units.status, "available"), isNull(units.archivedAt)))
    .orderBy(asc(units.statusSince))
    .limit(8);
  const tenantsWithoutContract = await q
    .select({ t: tenants })
    .from(tenants)
    .where(
      and(
        eq(tenants.orgId, orgId),
        eq(tenants.status, "active"),
        sql`not exists (select 1 from contracts c where c.tenant_id = ${tenants.id} and c.status in ('pending','active'))`,
      ),
    )
    .limit(8);
  return { expiring: detail, notices, upcoming, vacant, tenantsWithoutContract };
}

import { and, asc, between, eq, isNull, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import {
  buildings,
  maintenanceCategories,
  maintenanceRequests,
  organisations,
  owners,
  payments,
  receipts,
  statements,
  tenants,
  units,
} from "@/db/schema";
import { addDays, endOfMonth, isValidISO, parseISO, startOfMonth, toISO } from "@/lib/dates";
import { writeAudit } from "./audit";
import type { Ctx } from "./context";
import { DomainError, NotFoundError } from "./errors";
import { computeOwnerStatement, type GatewayFeeMode, type StatementTotals } from "./finance";
import { assertCan, type Role } from "./permissions";
import { nextSequence } from "./sequences";

const role = (ctx: Ctx) => ctx.actor.role as Role;

export interface StatementRentLine {
  paidOn: string;
  receiptNumber: string | null;
  unit: string;
  building: string;
  buildingAr: string | null;
  tenant: string;
  tenantAr: string | null;
  method: string;
  amountBaisa: number;
  feeBaisa: number;
}

export interface StatementMaintenanceLine {
  completedOn: string;
  reference: string;
  unit: string;
  building: string;
  buildingAr: string | null;
  categoryKey: string | null;
  category: string;
  categoryAr: string | null;
  work: string;
  costBaisa: number;
}

export interface StatementCategoryTotal {
  key: string;
  name: string;
  nameAr: string | null;
  count: number;
  totalBaisa: number;
}

export interface StatementSnapshot {
  owner: { id: string; nameEn: string; nameAr: string | null; commissionBp: number; payoutFrequency: string; receiptPrefix: string };
  org: { name: string; nameAr: string | null; phone: string | null; email: string | null; address: string | null; crNumber: string | null; logoFileId: string | null };
  period: { from: string; to: string };
  gatewayFeeMode: GatewayFeeMode;
  vat: { enabled: boolean; bp: number };
  rentLines: StatementRentLine[];
  maintenanceLines: StatementMaintenanceLine[];
  maintenanceByCategory: StatementCategoryTotal[];
  totals: StatementTotals;
}

/**
 * Gather everything for an owner statement. Money is computed once, by computeOwnerStatement.
 * Only posted rent payments and completed repairs paid by the office (cost entered) can appear: security deposits have no payment
 * record and therefore cannot be reached from here.
 */
export async function buildStatementData(q: DB, orgId: string, ownerId: string, from: string, to: string): Promise<StatementSnapshot> {
  if (!isValidISO(from) || !isValidISO(to)) throw new DomainError("invalid_date");
  if (to < from) throw new DomainError("end_before_start");
  const [owner] = await q.select().from(owners).where(and(eq(owners.id, ownerId), eq(owners.orgId, orgId)));
  if (!owner) throw new NotFoundError("owner");
  const [org] = await q.select().from(organisations).where(eq(organisations.id, orgId));

  const pay = await q
    .select({
      payment: payments,
      unit: units.label,
      building: buildings.nameEn,
      buildingAr: buildings.nameAr,
      tenant: tenants.nameEn,
      tenantAr: tenants.nameAr,
    })
    .from(payments)
    .innerJoin(units, eq(units.id, payments.unitId))
    .innerJoin(buildings, eq(buildings.id, units.buildingId))
    .innerJoin(tenants, eq(tenants.id, payments.tenantId))
    .where(
      and(
        eq(payments.orgId, orgId),
        eq(payments.ownerId, ownerId),
        eq(payments.status, "posted"),
        between(payments.paidOn, from, to),
      ),
    )
    .orderBy(asc(payments.paidOn), asc(units.label));

  const receiptRows = pay.length
    ? await q
        .select({ paymentId: receipts.paymentId, display: receipts.displayNumber })
        .from(receipts)
        .where(and(eq(receipts.orgId, orgId), eq(receipts.ownerId, ownerId), eq(receipts.kind, "receipt")))
    : [];
  const receiptByPayment = new Map(receiptRows.map((r) => [r.paymentId, r.display]));

  const rentLines: StatementRentLine[] = pay.map((p) => ({
    paidOn: p.payment.paidOn,
    receiptNumber: receiptByPayment.get(p.payment.id) ?? null,
    unit: p.unit,
    building: p.building,
    buildingAr: p.buildingAr,
    tenant: p.tenant,
    tenantAr: p.tenantAr,
    method: p.payment.method,
    amountBaisa: p.payment.amountBaisa,
    feeBaisa: p.payment.gatewayFeeBaisa,
  }));

  const maint = await q
    .select({
      r: maintenanceRequests,
      unit: units.label,
      building: buildings.nameEn,
      buildingAr: buildings.nameAr,
      catKey: maintenanceCategories.key,
      cat: maintenanceCategories.nameEn,
      catAr: maintenanceCategories.nameAr,
    })
    .from(maintenanceRequests)
    .innerJoin(units, eq(units.id, maintenanceRequests.unitId))
    .innerJoin(buildings, eq(buildings.id, maintenanceRequests.buildingId))
    .leftJoin(maintenanceCategories, eq(maintenanceCategories.id, maintenanceRequests.categoryId))
    .where(
      and(
        eq(maintenanceRequests.orgId, orgId),
        eq(maintenanceRequests.ownerId, ownerId),
        eq(maintenanceRequests.status, "completed"),
        sql`${maintenanceRequests.costBaisa} is not null`,
        between(maintenanceRequests.completedOn, from, to),
      ),
    )
    .orderBy(asc(maintenanceRequests.completedOn));

  const maintenanceLines: StatementMaintenanceLine[] = maint.map((m) => ({
    completedOn: m.r.completedOn ?? from,
    reference: m.r.reference,
    unit: m.unit,
    building: m.building,
    buildingAr: m.buildingAr,
    categoryKey: m.catKey,
    category: m.cat ?? "Other",
    categoryAr: m.catAr,
    work: m.r.workPerformed ?? m.r.title,
    costBaisa: m.r.costBaisa ?? 0,
  }));

  const byCat = new Map<string, StatementCategoryTotal>();
  for (const l of maintenanceLines) {
    const key = l.categoryKey ?? "other";
    const cur = byCat.get(key) ?? { key, name: l.category, nameAr: l.categoryAr, count: 0, totalBaisa: 0 };
    cur.count += 1;
    cur.totalBaisa += l.costBaisa;
    byCat.set(key, cur);
  }

  const vat = { enabled: org.vatEnabled, bp: org.vatBp };
  const totals = computeOwnerStatement({
    payments: pay.map((p) => ({ amountBaisa: p.payment.amountBaisa, gatewayFeeBaisa: p.payment.gatewayFeeBaisa, status: p.payment.status })),
    maintenance: maintenanceLines.map((m) => ({ costBaisa: m.costBaisa })),
    commissionBp: owner.commissionBp,
    gatewayFeeMode: org.gatewayFeeMode,
    vat,
  });

  return {
    owner: {
      id: owner.id,
      nameEn: owner.nameEn,
      nameAr: owner.nameAr,
      commissionBp: owner.commissionBp,
      payoutFrequency: owner.payoutFrequency,
      receiptPrefix: owner.receiptPrefix,
    },
    org: {
      name: org.name,
      nameAr: org.nameAr,
      phone: org.phone,
      email: org.email,
      address: org.address,
      crNumber: org.crNumber,
      logoFileId: org.logoFileId,
    },
    period: { from, to },
    gatewayFeeMode: org.gatewayFeeMode,
    vat,
    rentLines,
    maintenanceLines,
    maintenanceByCategory: [...byCat.values()].sort((a, b) => b.totalBaisa - a.totalBaisa),
    totals,
  };
}

export async function generateStatement(db: DB, ctx: Ctx, input: { ownerId: string; from: string; to: string; locale: "en" | "ar" }) {
  assertCan(role(ctx), "statements:generate");
  return db.transaction(async (tx0) => {
    const tx = tx0 as unknown as DB;
    const snapshot = await buildStatementData(tx, ctx.orgId, input.ownerId, input.from, input.to);
    const year = input.to.slice(0, 4);
    const seq = await nextSequence(tx, ctx.orgId, `statement:${ctx.orgId}:${year}`);
    const [row] = await tx
      .insert(statements)
      .values({
        orgId: ctx.orgId,
        ownerId: input.ownerId,
        number: `ST-${year}-${String(seq).padStart(4, "0")}`,
        periodFrom: input.from,
        periodTo: input.to,
        locale: input.locale,
        snapshot,
        netBaisa: snapshot.totals.netToOwnerBaisa,
        generatedBy: ctx.actor.id,
      })
      .returning();
    await writeAudit(tx, ctx, {
      action: "statement.generated",
      entityType: "statement",
      entityId: row.id,
      after: { number: row.number, ownerId: input.ownerId, from: input.from, to: input.to, netBaisa: row.netBaisa },
      meta: { manager: ctx.actor.name },
    });
    return row;
  });
}

/** Multi-owner run: one statement per owner that had activity in the period. */
export async function generateAllStatements(db: DB, ctx: Ctx, input: { from: string; to: string; locale: "en" | "ar" }) {
  assertCan(role(ctx), "statements:generate");
  const list = await db.select().from(owners).where(and(eq(owners.orgId, ctx.orgId), isNull(owners.archivedAt)));
  const created = [];
  let skipped = 0;
  for (const o of list) {
    const data = await buildStatementData(db, ctx.orgId, o.id, input.from, input.to);
    if (data.rentLines.length === 0 && data.maintenanceLines.length === 0) {
      skipped += 1;
      continue;
    }
    created.push(await generateStatement(db, ctx, { ownerId: o.id, ...input }));
  }
  return { created, skipped };
}

export async function recordStatementShare(db: DB, ctx: Ctx, statementId: string, via: "download" | "whatsapp") {
  assertCan(role(ctx), "statements:generate");
  const [s] = await db.select().from(statements).where(and(eq(statements.id, statementId), eq(statements.orgId, ctx.orgId)));
  if (!s) throw new NotFoundError("statement");
  await db
    .update(statements)
    .set({ lastSharedAt: new Date(), shareCount: s.shareCount + 1 })
    .where(eq(statements.id, s.id));
  await writeAudit(db, ctx, {
    action: "statement.shared",
    entityType: "statement",
    entityId: s.id,
    meta: { via, owner: s.ownerId, from: s.periodFrom, to: s.periodTo, manager: ctx.actor.name },
  });
}

/** Last completed payout period for an owner's frequency, ending before `today`. */
export function lastPayoutPeriod(frequency: string, today: string): { from: string; to: string } {
  const { y, m } = parseISO(today);
  const firstOfThisMonth = toISO(y, m, 1);
  const prevEnd = addDays(firstOfThisMonth, -1);
  const months = frequency === "quarterly" ? 3 : frequency === "semi_annual" ? 6 : frequency === "annual" ? 12 : 1;
  let from = startOfMonth(prevEnd);
  for (let i = 1; i < months; i++) from = startOfMonth(addDays(from, -1));
  return { from, to: endOfMonth(prevEnd) };
}

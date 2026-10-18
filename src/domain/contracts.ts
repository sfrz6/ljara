import { and, asc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import {
  cheques,
  contracts,
  inspections,
  organisations,
  owners,
  scheduleItems,
  securityDeposits,
  tenants,
  units,
} from "@/db/schema";
import { addDays, addMonths, diffDays, isValidISO, todayISO } from "@/lib/dates";
import { formatDate } from "@/lib/dates";
import { writeAudit } from "./audit";
import { machineActor, systemCtx, type Ctx } from "./context";
import { DomainError, NotFoundError } from "./errors";
import { evaluateRenewalIncrease, generateSchedule, resolveRentCap, type PaymentFrequency } from "./finance";
import { insertCheque, promoteDueCheques, returnCheque } from "./cheques";
import { notifyStaff } from "./notifications";
import { assertCan, type Role } from "./permissions";
import { transitionUnit } from "./portfolio";
import { markTenantFormer } from "./tenants";
import { nextSequence } from "./sequences";

const role = (ctx: Ctx) => ctx.actor.role as Role;

export interface ChequeRow {
  seq: number;
  chequeNumber: string;
  bank: string;
  chequeDate: string;
  amountBaisa: number;
}

export interface SecurityInput {
  amountBaisa: number;
  chequeNumber?: string | null;
  bank?: string | null;
  chequeDate?: string | null;
  scanFileId?: string | null;
}

export interface ContractInput {
  unitId: string;
  tenantId: string;
  startDate: string;
  endDate: string;
  monthlyRentBaisa: number;
  paymentFrequency: PaymentFrequency;
  /** Full post-dated cheque set recorded in one entry (CR-6.1). Empty means no cheques: tenant pays another way. */
  cheques: ChequeRow[];
  security?: SecurityInput | null;
  signedDocFileId?: string | null;
  sanadReference?: string | null;
  /** Utility account numbers, shown to the tenant in the portal. */
  electricityAccount?: string | null;
  waterAccount?: string | null;
  notes?: string | null;
  previousContractId?: string | null;
}

export interface RenewalCapInfo {
  capBp: number | null;
  level: "unit" | "owner" | "organisation" | "none";
  increaseBp: number;
  exceedsCap: boolean;
}

/** Evaluate the cap for a proposed renewal rent, most specific first (CR-15.3). Pure read. */
export async function evaluateRenewal(q: DB, orgId: string, unitId: string, currentRent: number, proposedRent: number): Promise<RenewalCapInfo> {
  const [u] = await q.select().from(units).where(and(eq(units.id, unitId), eq(units.orgId, orgId)));
  if (!u) throw new NotFoundError("unit");
  const [o] = await q.select().from(owners).where(eq(owners.id, u.ownerId));
  const [org] = await q.select().from(organisations).where(eq(organisations.id, orgId));
  const { capBp, level } = resolveRentCap({
    unitCapBp: u.rentIncreaseCapBp,
    ownerCapBp: o.rentIncreaseCapBp,
    orgCapBp: org.rentIncreaseCapBp,
  });
  const { increaseBp, exceedsCap } = evaluateRenewalIncrease({ currentRent, proposedRent, capBp });
  return { capBp, level, increaseBp, exceedsCap };
}

/** Utility account numbers are free text (letters, digits, dashes, slashes) up to 40 characters. */
export function cleanAccount(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  if (!/^[A-Za-z0-9\-/ ]{1,40}$/.test(v)) throw new DomainError("invalid_account", {}, "electricityAccount");
  return v;
}

function validateTerms(input: ContractInput) {
  if (!isValidISO(input.startDate)) throw new DomainError("invalid_date", {}, "startDate");
  if (!isValidISO(input.endDate)) throw new DomainError("invalid_date", {}, "endDate");
  if (input.endDate <= input.startDate) throw new DomainError("end_before_start", {}, "endDate");
  if (!Number.isSafeInteger(input.monthlyRentBaisa) || input.monthlyRentBaisa <= 0) {
    throw new DomainError("invalid_amount", {}, "monthlyRent");
  }
  if (addMonths(input.startDate, 1) > addDays(input.endDate, 1)) throw new DomainError("term_too_short", {}, "endDate");
}

/**
 * Record a contract (CR-4.2). Contract registration itself happens outside Ijara (Sanad): staff record the dates
 * from the signed contract. One transaction creates the contract, the whole rent schedule, the cheque set and the
 * held security deposit, and moves the unit through reserved (and occupied when the term has already started).
 */
export async function createContract(db: DB, ctx: Ctx, input: ContractInput, opts: { capOverrideReason?: string } = {}) {
  assertCan(role(ctx), "contracts:manage");
  validateTerms(input);
  return db.transaction(async (tx0) => {
    const tx = tx0 as unknown as DB;
    const [unit] = await tx
      .select()
      .from(units)
      .where(and(eq(units.id, input.unitId), eq(units.orgId, ctx.orgId)))
      .for("update");
    if (!unit || unit.archivedAt) throw new NotFoundError("unit");
    const [tenant] = await tx
      .select()
      .from(tenants)
      .where(and(eq(tenants.id, input.tenantId), eq(tenants.orgId, ctx.orgId)));
    if (!tenant || tenant.status === "archived") throw new NotFoundError("tenant");

    let previous: typeof contracts.$inferSelect | undefined;
    if (input.previousContractId) {
      [previous] = await tx
        .select()
        .from(contracts)
        .where(and(eq(contracts.id, input.previousContractId), eq(contracts.orgId, ctx.orgId)));
      if (!previous || previous.unitId !== unit.id || previous.tenantId !== tenant.id) throw new NotFoundError("contract");
      if (previous.renewedToId) throw new DomainError("already_renewed");
      if (!["occupied", "notice_given"].includes(unit.status)) throw new DomainError("unit_not_occupied");
    } else {
      if (unit.status !== "available") throw new DomainError("unit_not_available", { status: unit.status });
      const other = await tx
        .select({ id: contracts.id })
        .from(contracts)
        .where(and(eq(contracts.tenantId, tenant.id), inArray(contracts.status, ["pending", "active"])));
      if (other.length > 0) throw new DomainError("tenant_has_contract");
    }

    const schedule = generateSchedule({
      startDate: input.startDate,
      endDate: input.endDate,
      monthlyRentBaisa: input.monthlyRentBaisa,
      frequency: input.paymentFrequency,
    });
    if (schedule.length === 0) throw new DomainError("term_too_short", {}, "endDate");

    if (input.cheques.length > 0) {
      if (input.cheques.length !== schedule.length) {
        throw new DomainError("cheque_count_mismatch", { expected: schedule.length, got: input.cheques.length });
      }
      const seen = new Set<string>();
      for (const c of input.cheques) {
        const key = `${c.bank.trim().toLowerCase()}|${c.chequeNumber.trim()}`;
        if (seen.has(key)) throw new DomainError("duplicate_cheque", { number: c.chequeNumber });
        seen.add(key);
        if (!isValidISO(c.chequeDate)) throw new DomainError("invalid_date", {}, `cheque_${c.seq}_date`);
        if (!Number.isSafeInteger(c.amountBaisa) || c.amountBaisa <= 0) throw new DomainError("invalid_amount", {}, `cheque_${c.seq}_amount`);
      }
    }
    if (input.security && (!Number.isSafeInteger(input.security.amountBaisa) || input.security.amountBaisa <= 0)) {
      throw new DomainError("invalid_amount", {}, "security");
    }

    const year = input.startDate.slice(0, 4);
    const seq = await nextSequence(tx, ctx.orgId, `contract:${ctx.orgId}:${year}`);
    const reference = `C-${year}-${String(seq).padStart(4, "0")}`;

    const [contract] = await tx
      .insert(contracts)
      .values({
        orgId: ctx.orgId,
        reference,
        unitId: unit.id,
        ownerId: unit.ownerId,
        tenantId: tenant.id,
        startDate: input.startDate,
        endDate: input.endDate,
        monthlyRentBaisa: input.monthlyRentBaisa,
        paymentFrequency: input.paymentFrequency,
        status: "pending",
        previousContractId: previous?.id ?? null,
        signedDocFileId: input.signedDocFileId ?? null,
        sanadReference: input.sanadReference ?? null,
        electricityAccount: cleanAccount(input.electricityAccount),
        waterAccount: cleanAccount(input.waterAccount),
        notes: input.notes ?? null,
        createdBy: ctx.actor.id,
      })
      .returning();

    const items = await tx
      .insert(scheduleItems)
      .values(
        schedule.map((s) => ({
          orgId: ctx.orgId,
          contractId: contract.id,
          unitId: unit.id,
          ownerId: unit.ownerId,
          tenantId: tenant.id,
          seq: s.seq,
          dueDate: s.dueDate,
          amountBaisa: s.amountBaisa,
        })),
      )
      .returning();

    if (input.cheques.length > 0) {
      const bySeq = new Map(items.map((i) => [i.seq, i]));
      for (const c of input.cheques) {
        const item = bySeq.get(c.seq);
        if (!item) throw new DomainError("cheque_count_mismatch", { expected: schedule.length, got: input.cheques.length });
        await insertCheque(tx, ctx, {
          scheduleItemId: item.id,
          chequeNumber: c.chequeNumber,
          bank: c.bank,
          chequeDate: c.chequeDate,
          amountBaisa: c.amountBaisa,
        });
      }
    }

    if (input.security) {
      await tx.insert(securityDeposits).values({
        orgId: ctx.orgId,
        contractId: contract.id,
        amountBaisa: input.security.amountBaisa,
        chequeNumber: input.security.chequeNumber ?? null,
        bank: input.security.bank ?? null,
        chequeDate: input.security.chequeDate ?? null,
        scanFileId: input.security.scanFileId ?? null,
      });
    }

    await writeAudit(tx, ctx, {
      action: "contract.created",
      entityType: "contract",
      entityId: contract.id,
      after: { ...contract, scheduleItems: items.length, cheques: input.cheques.length, security: input.security?.amountBaisa ?? null },
    });

    if (previous) {
      await tx.update(contracts).set({ renewedToId: contract.id, outcome: "renewed" }).where(eq(contracts.id, previous.id));
      const cap = await evaluateRenewal(tx, ctx.orgId, unit.id, previous.monthlyRentBaisa, input.monthlyRentBaisa);
      if (cap.exceedsCap && !opts.capOverrideReason?.trim()) throw new DomainError("cap_override_required", {}, "capOverrideReason");
      await writeAudit(tx, ctx, {
        action: cap.exceedsCap ? "contract.renewal_cap_overridden" : "contract.renewal_cap_checked",
        entityType: "contract",
        entityId: contract.id,
        before: { previousRentBaisa: previous.monthlyRentBaisa, previousContract: previous.reference },
        after: { proposedRentBaisa: input.monthlyRentBaisa },
        meta: { capBp: cap.capBp, capLevel: cap.level, increaseBp: cap.increaseBp, exceedsCap: cap.exceedsCap, reason: opts.capOverrideReason ?? null },
        elevated: cap.exceedsCap,
      });
      if (input.startDate <= todayISO()) await activateInternal(tx, ctx, contract.id);
    } else {
      await transitionUnit(tx, ctx, unit.id, "reserved");
      if (input.startDate <= todayISO()) await activateInternal(tx, ctx, contract.id);
    }
    await promoteDueCheques(tx, ctx.orgId);
    return contract;
  });
}

async function activateInternal(tx: DB, ctx: Ctx, contractId: string) {
  const [c] = await tx.select().from(contracts).where(and(eq(contracts.id, contractId), eq(contracts.orgId, ctx.orgId)));
  if (!c) throw new NotFoundError("contract");
  if (c.status !== "pending") throw new DomainError("contract_not_pending");
  const [unit] = await tx.select().from(units).where(eq(units.id, c.unitId));
  if (c.previousContractId) {
    const today = todayISO();
    await tx
      .update(contracts)
      .set({ status: "ended", endedOn: today, outcome: "renewed" })
      .where(eq(contracts.id, c.previousContractId));
    if (unit.status === "notice_given") await transitionUnit(tx, ctx, unit.id, "occupied", { note: "renewed" });
  } else if (unit.status === "reserved") {
    await transitionUnit(tx, ctx, unit.id, "occupied");
  }
  await tx.update(contracts).set({ status: "active" }).where(eq(contracts.id, c.id));
  await writeAudit(tx, ctx, {
    action: "contract.activated",
    entityType: "contract",
    entityId: c.id,
    before: { status: "pending" },
    after: { status: "active" },
  });
}

export async function activateContract(db: DB, ctx: Ctx, contractId: string) {
  assertCan(role(ctx), "contracts:manage");
  return db.transaction(async (tx) => activateInternal(tx as unknown as DB, ctx, contractId));
}

/** Cancel a contract that never started (unit goes back to available, schedule and cheques returned). */
export async function cancelPendingContract(db: DB, ctx: Ctx, contractId: string, reason: string) {
  assertCan(role(ctx), "contracts:manage");
  if (reason.trim().length < 3) throw new DomainError("reason_required", {}, "reason");
  return db.transaction(async (tx0) => {
    const tx = tx0 as unknown as DB;
    const [c] = await tx.select().from(contracts).where(and(eq(contracts.id, contractId), eq(contracts.orgId, ctx.orgId)));
    if (!c) throw new NotFoundError("contract");
    if (c.status !== "pending") throw new DomainError("contract_not_pending");
    const paid = await tx
      .select({ id: scheduleItems.id })
      .from(scheduleItems)
      .where(and(eq(scheduleItems.contractId, c.id), eq(scheduleItems.status, "paid")));
    if (paid.length > 0) throw new DomainError("contract_has_payments");
    await returnOpenCheques(tx, ctx, c.id);
    await tx.update(scheduleItems).set({ status: "cancelled" }).where(eq(scheduleItems.contractId, c.id));
    await tx.update(contracts).set({ status: "ended", outcome: "cancelled", endedOn: todayISO() }).where(eq(contracts.id, c.id));
    if (c.previousContractId) {
      await tx.update(contracts).set({ renewedToId: null, outcome: null }).where(eq(contracts.id, c.previousContractId));
    } else {
      await transitionUnit(tx, ctx, c.unitId, "available", { note: "contract cancelled" });
    }
    await writeAudit(tx, ctx, { action: "contract.cancelled", entityType: "contract", entityId: c.id, meta: { reason } });
  });
}

async function returnOpenCheques(tx: DB, ctx: Ctx, contractId: string) {
  const open = await tx
    .select()
    .from(cheques)
    .where(and(eq(cheques.contractId, contractId), inArray(cheques.status, ["received", "due"])));
  for (const c of open) await returnCheque(tx, systemCtx(ctx.orgId, ctx.actor.name), c.id, "contract ended");
}

/* ------------------------------ Move-out (CR-4.5) ------------------------------ */

/** One decision, two outcomes. "Move out": notice is given, the unit enters notice_given. */
export async function giveNotice(db: DB, ctx: Ctx, contractId: string, input: { noticeGivenOn: string; moveOutDate: string }) {
  assertCan(role(ctx), "contracts:manage");
  if (!isValidISO(input.noticeGivenOn) || !isValidISO(input.moveOutDate)) throw new DomainError("invalid_date");
  return db.transaction(async (tx0) => {
    const tx = tx0 as unknown as DB;
    const [c] = await tx.select().from(contracts).where(and(eq(contracts.id, contractId), eq(contracts.orgId, ctx.orgId)));
    if (!c) throw new NotFoundError("contract");
    if (c.status !== "active") throw new DomainError("contract_not_active");
    if (c.renewedToId) throw new DomainError("already_renewed");
    if (c.noticeGivenOn) throw new DomainError("notice_already_given");
    await tx
      .update(contracts)
      .set({ noticeGivenOn: input.noticeGivenOn, moveOutDate: input.moveOutDate, outcome: "moved_out" })
      .where(eq(contracts.id, c.id));
    await transitionUnit(tx, ctx, c.unitId, "notice_given");
    await writeAudit(tx, ctx, {
      action: "contract.notice_given",
      entityType: "contract",
      entityId: c.id,
      after: { noticeGivenOn: input.noticeGivenOn, moveOutDate: input.moveOutDate },
    });
  });
}

export async function withdrawNotice(db: DB, ctx: Ctx, contractId: string) {
  assertCan(role(ctx), "contracts:manage");
  return db.transaction(async (tx0) => {
    const tx = tx0 as unknown as DB;
    const [c] = await tx.select().from(contracts).where(and(eq(contracts.id, contractId), eq(contracts.orgId, ctx.orgId)));
    if (!c || c.status !== "active" || !c.noticeGivenOn) throw new DomainError("no_notice_to_withdraw");
    await tx.update(contracts).set({ noticeGivenOn: null, moveOutDate: null, outcome: null }).where(eq(contracts.id, c.id));
    await transitionUnit(tx, ctx, c.unitId, "occupied", { note: "notice withdrawn" });
    await writeAudit(tx, ctx, { action: "contract.notice_withdrawn", entityType: "contract", entityId: c.id });
  });
}

/**
 * Complete the move-out: the unit is vacated and immediately placed under inspection (CR-14.5).
 * Remaining post-dated cheques are returned, the schedule is closed and the tenant becomes a former tenant.
 */
export async function completeMoveOut(db: DB, ctx: Ctx, contractId: string, input: { actualDate?: string } = {}) {
  assertCan(role(ctx), "contracts:manage");
  return db.transaction(async (tx0) => {
    const tx = tx0 as unknown as DB;
    const [c] = await tx.select().from(contracts).where(and(eq(contracts.id, contractId), eq(contracts.orgId, ctx.orgId)));
    if (!c) throw new NotFoundError("contract");
    if (c.status !== "active" || !c.noticeGivenOn) throw new DomainError("no_notice_given");
    const today = input.actualDate ?? todayISO();
    await returnOpenCheques(tx, ctx, c.id);
    await tx
      .update(scheduleItems)
      .set({ status: "cancelled" })
      .where(and(eq(scheduleItems.contractId, c.id), eq(scheduleItems.status, "open"), sql`${scheduleItems.dueDate} > ${today}`));
    await tx.update(contracts).set({ status: "ended", endedOn: today, outcome: "moved_out" }).where(eq(contracts.id, c.id));
    await transitionUnit(tx, ctx, c.unitId, "vacated");
    await transitionUnit(tx, ctx, c.unitId, "under_inspection", { note: "move-out inspection" });
    const [inspection] = await tx
      .insert(inspections)
      .values({ orgId: ctx.orgId, unitId: c.unitId, contractId: c.id })
      .returning();
    await markTenantFormer(tx, ctx, c.tenantId);
    const [unit] = await tx.select().from(units).where(eq(units.id, c.unitId));
    await notifyStaff(tx, {
      orgId: ctx.orgId,
      roles: ["maintenance", "manager"],
      template: "inspection_requested",
      vars: { unit: unit.label },
      idempotencyKey: `inspection_requested:${inspection.id}`,
      link: `/inspections`,
      related: { type: "inspection", id: inspection.id },
    });
    await writeAudit(tx, ctx, {
      action: "contract.moved_out",
      entityType: "contract",
      entityId: c.id,
      after: { endedOn: today, unitStatus: "under_inspection", inspectionId: inspection.id },
    });
    return { inspection };
  });
}

/** Resolve the held security cheque at the end of the tenancy. Never touches rent, payments or owner figures. */
export async function resolveSecurityDeposit(
  db: DB,
  ctx: Ctx,
  contractId: string,
  input: { resolution: "returned" | "applied"; note: string },
) {
  assertCan(role(ctx), "contracts:manage");
  const [dep] = await db
    .select()
    .from(securityDeposits)
    .where(and(eq(securityDeposits.contractId, contractId), eq(securityDeposits.orgId, ctx.orgId)));
  if (!dep) throw new NotFoundError("security_deposit");
  if (dep.status !== "held") throw new DomainError("deposit_already_resolved");
  await db
    .update(securityDeposits)
    .set({ status: input.resolution, resolvedOn: todayISO(), resolutionNote: input.note })
    .where(eq(securityDeposits.id, dep.id));
  await writeAudit(db, ctx, {
    action: "security_deposit.resolved",
    entityType: "contract",
    entityId: contractId,
    before: { status: "held" },
    after: { status: input.resolution },
    meta: { note: input.note },
    elevated: true,
  });
}

export async function updateContractDocs(
  db: DB,
  ctx: Ctx,
  contractId: string,
  input: { signedDocFileId?: string | null; sanadReference?: string | null; notes?: string | null; electricityAccount?: string | null; waterAccount?: string | null },
) {
  assertCan(role(ctx), "contracts:manage");
  const [existing] = await db.select({ id: contracts.id }).from(contracts).where(and(eq(contracts.id, contractId), eq(contracts.orgId, ctx.orgId)));
  if (!existing) throw new NotFoundError("contract");
  const patch = {
    ...input,
    ...(input.electricityAccount !== undefined ? { electricityAccount: cleanAccount(input.electricityAccount) } : {}),
    ...(input.waterAccount !== undefined ? { waterAccount: cleanAccount(input.waterAccount) } : {}),
  };
  await db.update(contracts).set(patch).where(eq(contracts.id, contractId));
  await writeAudit(db, ctx, { action: "contract.updated", entityType: "contract", entityId: contractId, after: input });
}

/* ------------------------------ Alerts and jobs ------------------------------ */

export interface ExpiringContract {
  id: string;
  reference: string;
  endDate: string;
  daysLeft: number;
}

/** Active contracts ending inside the alert window with no renew / move-out decision yet. */
export async function expiringContracts(q: DB, orgId: string, alertDays: number, today = todayISO()) {
  const limit = addDays(today, alertDays);
  const rows = await q
    .select()
    .from(contracts)
    .where(
      and(
        eq(contracts.orgId, orgId),
        eq(contracts.status, "active"),
        lte(contracts.endDate, limit),
        isNull(contracts.renewedToId),
        isNull(contracts.noticeGivenOn),
      ),
    )
    .orderBy(asc(contracts.endDate));
  return rows.map((c) => ({ ...c, daysLeft: diffDays(today, c.endDate) }));
}

export async function alertExpiringContracts(q: DB, orgId: string, today = todayISO()): Promise<number> {
  const [org] = await q.select().from(organisations).where(eq(organisations.id, orgId));
  const list = await expiringContracts(q, orgId, org.contractAlertDays, today);
  let sent = 0;
  for (const c of list) {
    const [unit] = await q.select().from(units).where(eq(units.id, c.unitId));
    const [tenant] = await q.select().from(tenants).where(eq(tenants.id, c.tenantId));
    sent += await notifyStaff(q, {
      orgId,
      roles: ["contracts", "manager"],
      template: "contract_expiring",
      vars: { reference: c.reference, unit: unit.label, tenant: tenant.nameEn, date: formatDate(c.endDate, "en") },
      idempotencyKey: `contract_expiring:${c.id}`,
      link: `/contracts/${c.id}`,
      related: { type: "contract", id: c.id },
      pref: "contractExpiring",
    });
  }
  return sent;
}

/** Start pending contracts whose start date has arrived. */
export async function activateDueContracts(db: DB, orgId: string, today = todayISO()): Promise<number> {
  const due = await db
    .select()
    .from(contracts)
    .where(and(eq(contracts.orgId, orgId), eq(contracts.status, "pending"), lte(contracts.startDate, today)));
  const ctx = systemCtx(orgId);
  let n = 0;
  for (const c of due) {
    await db.transaction(async (tx) => activateInternal(tx as unknown as DB, ctx, c.id));
    n += 1;
  }
  return n;
}

export { machineActor };

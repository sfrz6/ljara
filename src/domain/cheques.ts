import { and, eq, inArray, lte } from "drizzle-orm";
import type { DB } from "@/db/client";
import { cheques, scheduleItems, tenants, units } from "@/db/schema";
import { todayISO } from "@/lib/dates";
import { formatOMR } from "@/lib/money";
import { writeAudit } from "./audit";
import { machineActor, systemCtx, type Ctx } from "./context";
import { DomainError, NotFoundError } from "./errors";
import { assertTransition, chequeMachine, type ChequeStatus } from "./machines";
import { notifyStaff } from "./notifications";
import { recordPayment } from "./payments";
import { assertCan, can, type Role } from "./permissions";

const role = (ctx: Ctx) => ctx.actor.role as Role;

/**
 * received -> due happens by the calendar. Rather than depend on a scheduler alone, it is applied whenever a
 * cheque list or dashboard is loaded and again by the daily job. Idempotent.
 */
export async function promoteDueCheques(q: DB, orgId: string, today = todayISO()): Promise<number> {
  const due = await q
    .select()
    .from(cheques)
    .where(and(eq(cheques.orgId, orgId), eq(cheques.status, "received"), lte(cheques.chequeDate, today)));
  if (due.length === 0) return 0;
  const ctx = systemCtx(orgId);
  for (const c of due) {
    const upd = await q
      .update(cheques)
      .set({ status: "due" })
      .where(and(eq(cheques.id, c.id), eq(cheques.status, "received")))
      .returning({ id: cheques.id });
    if (upd.length === 0) continue;
    await writeAudit(q, ctx, {
      action: "cheque.status_changed",
      entityType: "cheque",
      entityId: c.id,
      before: { status: "received" },
      after: { status: "due" },
    });
    const [unit] = await q.select({ label: units.label }).from(units).where(eq(units.id, c.unitId));
    const [tenant] = await q.select({ n: tenants.nameEn }).from(tenants).where(eq(tenants.id, c.tenantId));
    await notifyStaff(q, {
      orgId,
      roles: ["accounts", "manager"],
      template: "cheque_due",
      vars: { number: c.chequeNumber, amount: formatOMR(c.amountBaisa, "en"), tenant: tenant?.n ?? "", unit: unit?.label ?? "" },
      idempotencyKey: `cheque_due:${c.id}`,
      link: `/cheques?focus=${c.id}`,
      related: { type: "cheque", id: c.id },
      pref: "chequeDue",
    });
  }
  return due.length;
}

async function loadCheque(q: DB, ctx: Ctx, chequeId: string) {
  const [c] = await q.select().from(cheques).where(and(eq(cheques.id, chequeId), eq(cheques.orgId, ctx.orgId)));
  if (!c) throw new NotFoundError("cheque");
  return c;
}

async function move(
  q: DB,
  ctx: Ctx,
  c: typeof cheques.$inferSelect,
  to: ChequeStatus,
  patch: Partial<typeof cheques.$inferInsert>,
  meta?: Record<string, unknown>,
) {
  assertTransition(chequeMachine, c.status as ChequeStatus, to, machineActor(ctx));
  const upd = await q
    .update(cheques)
    .set({ ...patch, status: to })
    .where(and(eq(cheques.id, c.id), eq(cheques.status, c.status)))
    .returning();
  if (upd.length === 0) throw new DomainError("concurrent_change");
  await writeAudit(q, ctx, {
    action: "cheque.status_changed",
    entityType: "cheque",
    entityId: c.id,
    before: { status: c.status },
    after: { status: to, ...patch },
    meta,
  });
  return upd[0];
}

/** `on` backdates the business date (used by data import and demo seeding). Defaults to today. */
export async function depositCheque(db: DB, ctx: Ctx, chequeId: string, opts: { on?: string } = {}) {
  assertCan(role(ctx), "cheques:process");
  const c = await loadCheque(db, ctx, chequeId);
  return move(db, ctx, c, "deposited", { depositedOn: opts.on ?? todayISO() });
}

/** One click "collected": a due cheque is deposited and collected in a single action (CR-14.1). */
export async function collectCheque(db: DB, ctx: Ctx, chequeId: string, opts: { on?: string } = {}) {
  assertCan(role(ctx), "cheques:process");
  return db.transaction(async (tx0) => {
    const tx = tx0 as unknown as DB;
    const on = opts.on ?? todayISO();
    let c = await loadCheque(tx, ctx, chequeId);
    if (c.status === "due") c = await move(tx, ctx, c, "deposited", { depositedOn: on });
    const collected = await move(tx, ctx, c, "collected", { collectedOn: on });
    const { payment, receipt } = await recordPayment(tx, ctx, {
      scheduleItemId: c.scheduleItemId,
      method: "cheque",
      chequeId: c.id,
      reference: `${c.bank} #${c.chequeNumber}`,
      paidOn: on,
    });
    return { cheque: collected, payment, receipt };
  });
}

export async function bounceCheque(db: DB, ctx: Ctx, chequeId: string, reason: string, opts: { on?: string } = {}) {
  assertCan(role(ctx), "cheques:process");
  if (reason.trim().length < 2) throw new DomainError("reason_required", {}, "reason");
  return db.transaction(async (tx0) => {
    const tx = tx0 as unknown as DB;
    const c = await loadCheque(tx, ctx, chequeId);
    const updated = await move(tx, ctx, c, "bounced", { bouncedOn: opts.on ?? todayISO(), bounceReason: reason });
    const [unit] = await tx.select({ label: units.label }).from(units).where(eq(units.id, c.unitId));
    const [tenant] = await tx.select({ n: tenants.nameEn }).from(tenants).where(eq(tenants.id, c.tenantId));
    // The manager must see this at once: in-app, urgent, and on the dashboard (CR-6.3, G7).
    await notifyStaff(tx, {
      orgId: ctx.orgId,
      roles: ["manager", "accounts"],
      template: "cheque_bounced",
      vars: { number: c.chequeNumber, amount: formatOMR(c.amountBaisa, "en"), tenant: tenant?.n ?? "", unit: unit?.label ?? "" },
      idempotencyKey: `cheque_bounced:${c.id}:${updated.bouncedOn}`,
      link: `/cheques?focus=${c.id}`,
      related: { type: "cheque", id: c.id },
      pref: "chequeBounced",
    });
    return updated;
  });
}

export async function startFollowUp(db: DB, ctx: Ctx, chequeId: string, note: string) {
  assertCan(role(ctx), "cheques:process");
  const c = await loadCheque(db, ctx, chequeId);
  return move(db, ctx, c, "follow_up", { followUpNote: note });
}

export async function updateFollowUpNote(db: DB, ctx: Ctx, chequeId: string, note: string) {
  assertCan(role(ctx), "cheques:process");
  const c = await loadCheque(db, ctx, chequeId);
  if (c.status !== "follow_up") throw new DomainError("invalid_transition", { machine: "cheque", from: c.status, to: "follow_up" });
  await db.update(cheques).set({ followUpNote: note }).where(eq(cheques.id, c.id));
  await writeAudit(db, ctx, { action: "cheque.follow_up_note", entityType: "cheque", entityId: c.id, after: { followUpNote: note } });
}

/** Bounced cheque recovered during follow-up: the tenant paid by another route. Issues the receipt. */
export async function recoverCheque(
  db: DB,
  ctx: Ctx,
  chequeId: string,
  input: { method: "cheque" | "cash" | "bank_transfer"; reference?: string },
) {
  assertCan(role(ctx), "cheques:process");
  return db.transaction(async (tx0) => {
    const tx = tx0 as unknown as DB;
    const c = await loadCheque(tx, ctx, chequeId);
    const updated = await move(tx, ctx, c, "collected", { collectedOn: todayISO() }, { recoveredBy: input.method });
    const { payment, receipt } = await recordPayment(tx, ctx, {
      scheduleItemId: c.scheduleItemId,
      method: input.method,
      chequeId: c.id,
      reference: input.reference || `${c.bank} #${c.chequeNumber}`,
    });
    return { cheque: updated, payment, receipt };
  });
}

export async function writeOffCheque(db: DB, ctx: Ctx, chequeId: string, reason: string) {
  assertCan(role(ctx), "cheques:writeoff");
  if (reason.trim().length < 3) throw new DomainError("reason_required", {}, "reason");
  return db.transaction(async (tx0) => {
    const tx = tx0 as unknown as DB;
    const c = await loadCheque(tx, ctx, chequeId);
    const updated = await move(tx, ctx, c, "written_off", { followUpNote: reason });
    await tx.update(scheduleItems).set({ status: "written_off" }).where(eq(scheduleItems.id, c.scheduleItemId));
    return updated;
  });
}

/** Hand a not yet deposited cheque back to the tenant (early move-out or replaced by another payment method). */
export async function returnCheque(db: DB, ctx: Ctx, chequeId: string, note?: string) {
  const c = await loadCheque(db, ctx, chequeId);
  return move(db, ctx, c, "returned", { followUpNote: note ?? null });
}

export interface ChequeInput {
  scheduleItemId: string;
  chequeNumber: string;
  bank: string;
  chequeDate: string;
  amountBaisa: number;
  scanFileId?: string | null;
}

/** Insert a cheque for a schedule item. Used by contract creation and by "add cheque" on a schedule line. */
export async function insertCheque(q: DB, ctx: Ctx, input: ChequeInput) {
  const [item] = await q
    .select()
    .from(scheduleItems)
    .where(and(eq(scheduleItems.id, input.scheduleItemId), eq(scheduleItems.orgId, ctx.orgId)));
  if (!item) throw new NotFoundError("schedule_item");
  if (item.status !== "open") throw new DomainError("item_not_open");
  const number = input.chequeNumber.trim();
  const bank = input.bank.trim();
  if (!number) throw new DomainError("cheque_number_required", {}, "chequeNumber");
  if (!bank) throw new DomainError("bank_required", {}, "bank");
  const dup = await q
    .select({ id: cheques.id })
    .from(cheques)
    .where(
      and(
        eq(cheques.orgId, ctx.orgId),
        eq(cheques.chequeNumber, number),
        eq(cheques.bank, bank),
        inArray(cheques.status, ["received", "due", "deposited", "collected", "bounced", "follow_up"]),
      ),
    );
  if (dup.length > 0) throw new DomainError("duplicate_cheque", { number });
  const [row] = await q
    .insert(cheques)
    .values({
      orgId: ctx.orgId,
      contractId: item.contractId,
      scheduleItemId: item.id,
      unitId: item.unitId,
      ownerId: item.ownerId,
      tenantId: item.tenantId,
      chequeNumber: number,
      bank,
      amountBaisa: input.amountBaisa,
      chequeDate: input.chequeDate,
      scanFileId: input.scanFileId ?? null,
    })
    .returning();
  await writeAudit(q, ctx, { action: "cheque.received", entityType: "cheque", entityId: row.id, after: row });
  return row;
}

export async function addChequeToItem(db: DB, ctx: Ctx, input: ChequeInput) {
  assertCan(role(ctx), "cheques:record");
  const row = await insertCheque(db, ctx, input);
  await promoteDueCheques(db, ctx.orgId);
  return row;
}

export async function attachChequeScan(db: DB, ctx: Ctx, chequeId: string, fileId: string) {
  if (!can(role(ctx), "cheques:record")) assertCan(role(ctx), "cheques:process");
  await loadCheque(db, ctx, chequeId);
  await db.update(cheques).set({ scanFileId: fileId }).where(eq(cheques.id, chequeId));
  await writeAudit(db, ctx, { action: "cheque.scan_attached", entityType: "cheque", entityId: chequeId });
}

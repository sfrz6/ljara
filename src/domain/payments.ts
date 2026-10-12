import { and, eq, inArray, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import {
  buildings,
  cheques,
  contracts,
  onlinePaymentIntents,
  organisations,
  owners,
  payments,
  receiptCounters,
  receipts,
  scheduleItems,
  tenants,
  units,
  type ReceiptSnapshot,
} from "@/db/schema";
import { todayISO, formatDate } from "@/lib/dates";
import { formatOMR } from "@/lib/money";
import { randomToken } from "@/lib/password";
import { writeAudit } from "./audit";
import { machineActor, type Ctx } from "./context";
import { DomainError, NotFoundError } from "./errors";
import { formatReceiptNumber, gatewayFee } from "./finance";
import { assertTransition, chequeMachine, type ChequeStatus } from "./machines";
import { notifyStaff, notifyTenant } from "./notifications";
import { assertCan, type Role } from "./permissions";

type Method = "cheque" | "online" | "cash" | "bank_transfer";

const LIVE_CHEQUE: ChequeStatus[] = ["received", "due", "deposited"];

/* ----------------------------- Receipt numbering ----------------------------- */

/**
 * Take the next receipt number for an owner. The UPDATE locks the owner's counter row until the surrounding
 * transaction ends, so two staff members issuing at the same moment are serialised by the database and receive
 * consecutive numbers. If the transaction rolls back, the increment rolls back with it: no gaps (proposal 4.6).
 */
export async function takeReceiptNumber(tx: DB, ownerId: string): Promise<number> {
  const [row] = await tx
    .update(receiptCounters)
    .set({ lastNumber: sql`${receiptCounters.lastNumber} + 1` })
    .where(eq(receiptCounters.ownerId, ownerId))
    .returning({ n: receiptCounters.lastNumber });
  if (!row) throw new DomainError("receipt_counter_missing");
  return row.n;
}

async function buildSnapshot(tx: DB, payment: typeof payments.$inferSelect): Promise<ReceiptSnapshot> {
  const [row] = await tx
    .select({
      org: organisations,
      owner: owners,
      tenant: tenants,
      unit: units,
      building: buildings,
      contract: contracts,
      item: scheduleItems,
    })
    .from(payments)
    .innerJoin(organisations, eq(organisations.id, payments.orgId))
    .innerJoin(owners, eq(owners.id, payments.ownerId))
    .innerJoin(tenants, eq(tenants.id, payments.tenantId))
    .innerJoin(units, eq(units.id, payments.unitId))
    .innerJoin(buildings, eq(buildings.id, units.buildingId))
    .innerJoin(contracts, eq(contracts.id, payments.contractId))
    .innerJoin(scheduleItems, eq(scheduleItems.id, payments.scheduleItemId))
    .where(eq(payments.id, payment.id));
  let chequeNumber: string | null = null;
  let bank: string | null = null;
  if (payment.chequeId) {
    const [c] = await tx.select().from(cheques).where(eq(cheques.id, payment.chequeId));
    chequeNumber = c?.chequeNumber ?? null;
    bank = c?.bank ?? null;
  }
  return {
    orgName: row.org.name,
    orgNameAr: row.org.nameAr,
    orgPhone: row.org.phone,
    ownerName: row.owner.nameEn,
    ownerNameAr: row.owner.nameAr,
    tenantName: row.tenant.nameEn,
    tenantNameAr: row.tenant.nameAr,
    buildingName: row.building.nameEn,
    buildingNameAr: row.building.nameAr,
    unitLabel: row.unit.label,
    contractReference: row.contract.reference,
    periodLabelDate: row.item.dueDate,
    paidOn: payment.paidOn,
    method: payment.method,
    chequeNumber,
    bank,
    reference: payment.reference,
    logoFileId: row.org.logoFileId,
  };
}

/* -------------------------------- Record payment ------------------------------- */

export interface RecordPaymentInput {
  scheduleItemId: string;
  method: Method;
  chequeId?: string | null;
  reference?: string | null;
  paidOn?: string;
  gatewayFeeBaisa?: number;
}

/**
 * The single place where rent becomes "collected". Marks the schedule item paid, creates the payment,
 * issues the receipt from the owner's gap-free series and audits everything, all in one transaction.
 * A payment can only ever reference a rent schedule item; there is no code path to pay a security deposit.
 */
export async function recordPayment(db: DB, ctx: Ctx, input: RecordPaymentInput, opts: { notify?: boolean } = {}) {
  return db.transaction(async (tx0) => {
    const tx = tx0 as unknown as DB;
    const [item] = await tx
      .select()
      .from(scheduleItems)
      .where(and(eq(scheduleItems.id, input.scheduleItemId), eq(scheduleItems.orgId, ctx.orgId)))
      .for("update");
    if (!item) throw new NotFoundError("schedule_item");
    if (item.status !== "open") throw new DomainError("item_not_open");

    const [existing] = await tx
      .select({ id: payments.id })
      .from(payments)
      .where(and(eq(payments.scheduleItemId, item.id), eq(payments.status, "posted")));
    if (existing) throw new DomainError("already_paid");

    const paidOn = input.paidOn ?? todayISO();
    const [payment] = await tx
      .insert(payments)
      .values({
        orgId: ctx.orgId,
        ownerId: item.ownerId,
        contractId: item.contractId,
        unitId: item.unitId,
        tenantId: item.tenantId,
        scheduleItemId: item.id,
        chequeId: input.chequeId ?? null,
        amountBaisa: item.amountBaisa,
        gatewayFeeBaisa: input.gatewayFeeBaisa ?? 0,
        method: input.method,
        reference: input.reference ?? null,
        paidOn,
        recordedBy: ctx.actor.id,
      })
      .returning();
    await tx.update(scheduleItems).set({ status: "paid", paidOn }).where(eq(scheduleItems.id, item.id));

    const receipt = await issueReceipt(tx, ctx, payment);
    await writeAudit(tx, ctx, {
      action: "payment.recorded",
      entityType: "payment",
      entityId: payment.id,
      after: { ...payment, receipt: receipt.displayNumber },
    });

    if (opts.notify !== false) {
      await notifyTenant(tx, {
        orgId: ctx.orgId,
        tenantId: payment.tenantId,
        template: "receipt_issued",
        vars: {
          number: receipt.displayNumber,
          amount: formatOMR(receipt.amountBaisa, "en"),
          date: formatDate(paidOn, "en"),
          link: `/portal/receipts`,
        },
        idempotencyKey: `receipt:${receipt.id}`,
        link: "/portal/receipts",
        related: { type: "receipt", id: receipt.id },
      });
    }
    return { payment, receipt };
  });
}

async function issueReceipt(tx: DB, ctx: Ctx, payment: typeof payments.$inferSelect) {
  const [owner] = await tx.select().from(owners).where(eq(owners.id, payment.ownerId));
  const [org] = await tx.select().from(organisations).where(eq(organisations.id, ctx.orgId));
  const number = await takeReceiptNumber(tx, payment.ownerId);
  const displayNumber = formatReceiptNumber(owner.receiptPrefix, number);
  const snapshot = await buildSnapshot(tx, payment);
  const [receipt] = await tx
    .insert(receipts)
    .values({
      orgId: ctx.orgId,
      ownerId: payment.ownerId,
      paymentId: payment.id,
      kind: "receipt",
      number,
      displayNumber,
      amountBaisa: payment.amountBaisa,
      locale: org.defaultLocale,
      snapshot,
      issuedBy: ctx.actor.id,
    })
    .returning();
  await writeAudit(tx, ctx, {
    action: "receipt.issued",
    entityType: "receipt",
    entityId: receipt.id,
    after: { number: receipt.displayNumber, amountBaisa: receipt.amountBaisa, paymentId: payment.id },
  });
  return receipt;
}

/** Manual payment by cash or bank transfer, for tenants who do not pay by cheque. */
export async function recordManualPayment(
  db: DB,
  ctx: Ctx,
  input: { scheduleItemId: string; method: "cash" | "bank_transfer"; reference?: string; paidOn?: string },
) {
  assertCan(ctx.actor.role as Role, "payments:record");
  const live = await db
    .select({ id: cheques.id })
    .from(cheques)
    .where(and(eq(cheques.scheduleItemId, input.scheduleItemId), eq(cheques.orgId, ctx.orgId), inArray(cheques.status, LIVE_CHEQUE)));
  if (live.length > 0) throw new DomainError("has_live_cheque");
  return recordPayment(db, ctx, input);
}

/* ------------------------------- Void and correct ------------------------------ */

/**
 * Correct an issued receipt. Receipts are immutable (proposal 2.3.1): the original is marked void with a reason,
 * a credit note takes the next number in the same series, and the payment is reversed. Nothing is deleted or renumbered.
 */
export async function voidReceipt(db: DB, ctx: Ctx, receiptId: string, reason: string) {
  assertCan(ctx.actor.role as Role, "receipts:void");
  if (reason.trim().length < 3) throw new DomainError("reason_required", {}, "reason");
  return db.transaction(async (tx0) => {
    const tx = tx0 as unknown as DB;
    const [receipt] = await tx
      .select()
      .from(receipts)
      .where(and(eq(receipts.id, receiptId), eq(receipts.orgId, ctx.orgId)))
      .for("update");
    if (!receipt) throw new NotFoundError("receipt");
    if (receipt.kind !== "receipt") throw new DomainError("cannot_void_credit_note");
    if (receipt.status === "voided") throw new DomainError("already_voided");

    const [payment] = await tx.select().from(payments).where(eq(payments.id, receipt.paymentId));
    const [owner] = await tx.select().from(owners).where(eq(owners.id, receipt.ownerId));
    const number = await takeReceiptNumber(tx, receipt.ownerId);
    const [note] = await tx
      .insert(receipts)
      .values({
        orgId: ctx.orgId,
        ownerId: receipt.ownerId,
        paymentId: receipt.paymentId,
        kind: "credit_note",
        number,
        displayNumber: formatReceiptNumber(owner.receiptPrefix, number),
        amountBaisa: receipt.amountBaisa,
        relatedReceiptId: receipt.id,
        voidReason: reason,
        locale: receipt.locale,
        snapshot: receipt.snapshot,
        issuedBy: ctx.actor.id,
      })
      .returning();
    await tx
      .update(receipts)
      .set({ status: "voided", voidReason: reason, voidedAt: new Date(), voidedBy: ctx.actor.id, relatedReceiptId: note.id })
      .where(eq(receipts.id, receipt.id));

    await tx.update(payments).set({ status: "voided", voidedAt: new Date() }).where(eq(payments.id, payment.id));
    await tx.update(scheduleItems).set({ status: "open", paidOn: null }).where(eq(scheduleItems.id, payment.scheduleItemId));

    if (payment.chequeId) {
      const [cheque] = await tx.select().from(cheques).where(eq(cheques.id, payment.chequeId));
      if (cheque && cheque.status === "collected") {
        assertTransition(chequeMachine, "collected", "deposited", machineActor(ctx));
        await tx.update(cheques).set({ status: "deposited", collectedOn: null }).where(eq(cheques.id, cheque.id));
        await writeAudit(tx, ctx, {
          action: "cheque.reopened",
          entityType: "cheque",
          entityId: cheque.id,
          before: { status: "collected" },
          after: { status: "deposited" },
          meta: { reason: "receipt_voided", receipt: receipt.displayNumber },
        });
      }
    }

    await writeAudit(tx, ctx, {
      action: "receipt.voided",
      entityType: "receipt",
      entityId: receipt.id,
      before: { status: "issued", number: receipt.displayNumber },
      after: { status: "voided", creditNote: note.displayNumber },
      meta: { reason },
    });
    await writeAudit(tx, ctx, {
      action: "payment.voided",
      entityType: "payment",
      entityId: payment.id,
      meta: { reason, creditNote: note.displayNumber },
    });
    return { creditNote: note };
  });
}

/* --------------------------------- Online payments ---------------------------------- */

/** Rules for "Pay now" on a schedule item (proposal 14.1). Security deposits cannot reach this path. */
export async function assertPayable(db: DB, orgId: string, item: typeof scheduleItems.$inferSelect) {
  const [org] = await db.select().from(organisations).where(eq(organisations.id, orgId));
  if (!org.onlinePaymentsEnabled) throw new DomainError("online_payments_disabled");
  if (item.status !== "open") throw new DomainError("item_not_open");
  const live = await db
    .select({ id: cheques.id })
    .from(cheques)
    .where(and(eq(cheques.scheduleItemId, item.id), inArray(cheques.status, LIVE_CHEQUE)));
  if (live.length > 0) throw new DomainError("covered_by_cheque");
  return org;
}

export interface TenantCtxLike {
  orgId: string;
  tenantId: string;
}

export async function createPaymentIntent(db: DB, t: TenantCtxLike, scheduleItemId: string) {
  const [item] = await db
    .select()
    .from(scheduleItems)
    .where(and(eq(scheduleItems.id, scheduleItemId), eq(scheduleItems.orgId, t.orgId), eq(scheduleItems.tenantId, t.tenantId)));
  if (!item) throw new NotFoundError("schedule_item");
  const org = await assertPayable(db, t.orgId, item);
  if (item.dueDate > todayISO()) throw new DomainError("not_due_yet");
  const [intent] = await db
    .insert(onlinePaymentIntents)
    .values({
      orgId: t.orgId,
      scheduleItemId: item.id,
      tenantId: t.tenantId,
      amountBaisa: item.amountBaisa,
      feeBaisa: gatewayFee(item.amountBaisa, org.gatewayFeeBp),
      gatewayRef: `SIM-${randomToken(9).replace(/[-_]/g, "x").toUpperCase()}`,
    })
    .returning();
  return intent;
}

export type GatewayOutcome = { result: "success" } | { result: "failure"; reason: string };

/**
 * Simulated gateway callback. In production this is the signed webhook from Thawani or OmanNet.
 * The business consequences are real: payment, receipt, schedule, dashboard, owner figures and audit.
 */
export async function completePaymentIntent(db: DB, t: TenantCtxLike, intentId: string, outcome: GatewayOutcome) {
  return db.transaction(async (tx0) => {
    const tx = tx0 as unknown as DB;
    const [intent] = await tx
      .select()
      .from(onlinePaymentIntents)
      .where(and(eq(onlinePaymentIntents.id, intentId), eq(onlinePaymentIntents.orgId, t.orgId), eq(onlinePaymentIntents.tenantId, t.tenantId)))
      .for("update");
    if (!intent) throw new NotFoundError("payment");
    if (intent.status !== "pending") throw new DomainError("intent_closed");

    const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, t.tenantId));
    const ctx: Ctx = {
      orgId: t.orgId,
      actor: { kind: "tenant", id: t.tenantId, name: tenant.nameEn, role: "tenant" },
    };

    if (outcome.result === "failure") {
      await tx
        .update(onlinePaymentIntents)
        .set({ status: "failed", failureReason: outcome.reason, completedAt: new Date() })
        .where(eq(onlinePaymentIntents.id, intent.id));
      await writeAudit(tx, ctx, {
        action: "payment.online_failed",
        entityType: "payment_intent",
        entityId: intent.id,
        meta: { reason: outcome.reason, amountBaisa: intent.amountBaisa },
      });
      await notifyTenant(tx, {
        orgId: t.orgId,
        tenantId: t.tenantId,
        template: "payment_failed",
        vars: { amount: formatOMR(intent.amountBaisa, tenant.locale), link: "/portal/schedule" },
        idempotencyKey: `payfail:${intent.id}`,
        link: "/portal/schedule",
      });
      return { status: "failed" as const, intent };
    }

    const [item] = await tx.select().from(scheduleItems).where(eq(scheduleItems.id, intent.scheduleItemId));
    // A bounced cheque for this instalment is recovered by the online payment.
    const [open] = await tx
      .select()
      .from(cheques)
      .where(and(eq(cheques.scheduleItemId, item.id), inArray(cheques.status, ["bounced", "follow_up"])));
    if (open) {
      if (open.status === "bounced") {
        assertTransition(chequeMachine, "bounced", "follow_up", "system");
        await tx.update(cheques).set({ status: "follow_up" }).where(eq(cheques.id, open.id));
      }
      assertTransition(chequeMachine, "follow_up", "collected", "manager");
      await tx.update(cheques).set({ status: "collected", collectedOn: todayISO() }).where(eq(cheques.id, open.id));
      await writeAudit(tx, ctx, {
        action: "cheque.recovered_online",
        entityType: "cheque",
        entityId: open.id,
        before: { status: open.status },
        after: { status: "collected" },
      });
    }

    const { payment, receipt } = await recordPayment(
      tx,
      ctx,
      {
        scheduleItemId: item.id,
        method: "online",
        chequeId: open?.id ?? null,
        reference: intent.gatewayRef,
        gatewayFeeBaisa: intent.feeBaisa,
      },
      { notify: true },
    );
    await tx
      .update(onlinePaymentIntents)
      .set({ status: "succeeded", completedAt: new Date() })
      .where(eq(onlinePaymentIntents.id, intent.id));
    await writeAudit(tx, ctx, {
      action: "payment.online_succeeded",
      entityType: "payment_intent",
      entityId: intent.id,
      meta: { paymentId: payment.id, receipt: receipt.displayNumber, feeBaisa: intent.feeBaisa },
    });
    const [u] = await tx.select().from(units).where(eq(units.id, item.unitId));
    await notifyStaff(tx, {
      orgId: t.orgId,
      roles: ["manager", "accounts"],
      template: "online_payment_received",
      vars: { tenant: tenant.nameEn, amount: formatOMR(intent.amountBaisa, "en"), unit: u.label, number: receipt.displayNumber },
      idempotencyKey: `onlinepay:${intent.id}`,
      link: `/receipts/${receipt.id}`,
    });
    return { status: "succeeded" as const, intent, payment, receipt };
  });
}

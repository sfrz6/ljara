"use server";

import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/db/client";
import { organisations, scheduleItems, tenants } from "@/db/schema";
import { activateContract, cancelPendingContract, completeMoveOut, createContract, giveNotice, resolveSecurityDeposit, updateContractDocs, withdrawNotice, type ChequeRow } from "@/domain/contracts";
import { addChequeToItem, attachChequeScan } from "@/domain/cheques";
import { notifyTenant } from "@/domain/notifications";
import { DomainError, NotFoundError } from "@/domain/errors";
import { parseForm, staffAction } from "@/lib/action";
import { formatDate, isValidISO } from "@/lib/dates";
import { formatOMR, parseOMR } from "@/lib/money";
import { saveFile } from "@/lib/storage";
import { getBaseUrl } from "@/lib/session";
import type { Ctx } from "@/domain/context";

const uuid = z.string().uuid("err.not_found");
const date = z.string().refine(isValidISO, "err.invalid_date");
const money = z.string().transform((v, c) => {
  const n = parseOMR(v);
  if (n === null || n <= 0) {
    c.addIssue({ code: "custom", message: "err.invalid_amount" });
    return z.NEVER;
  }
  return n;
});

async function upload(form: FormData, field: string, ctx: Ctx, category: "contract" | "cheque_scan"): Promise<string | null> {
  const f = form.get(field);
  if (!f || typeof f === "string" || f.size === 0) return null;
  const db = await getDb();
  return saveFile(db, { orgId: ctx.orgId, name: f.name, data: Buffer.from(await f.arrayBuffer()), category, createdBy: ctx.actor.id });
}

const chequeRow = z.object({ seq: z.number().int(), chequeNumber: z.string(), bank: z.string(), chequeDate: z.string(), amountBaisa: z.number().int() });

export const createContractAction = staffAction("contracts:manage", async ({ c, form, t }) => {
  const v = parseForm(
    z.object({
      unitId: uuid,
      tenantId: z.string().uuid("err.required"),
      startDate: date,
      endDate: date,
      monthlyRent: money,
      paymentFrequency: z.enum(["monthly", "quarterly", "semi_annual", "annual"]),
      payBy: z.enum(["cheques", "other"]),
      chequesJson: z.string().optional(),
      securityAmount: z.string().optional(),
      securityNumber: z.string().optional(),
      securityBank: z.string().optional(),
      securityDate: z.string().optional(),
      sanadReference: z.string().optional(),
      electricityAccount: z.string().optional(),
      waterAccount: z.string().optional(),
      previousContractId: z.string().optional(),
      capOverrideReason: z.string().optional(),
      notes: z.string().optional(),
    }),
    form,
    t,
  );
  let cheques: ChequeRow[] = [];
  if (v.payBy === "cheques") {
    try {
      cheques = z.array(chequeRow).parse(JSON.parse(v.chequesJson ?? "[]"));
    } catch {
      throw new DomainError("cheque_count_mismatch", { expected: "?", got: 0 });
    }
    for (const r of cheques) {
      if (!r.chequeNumber.trim()) throw new DomainError("cheque_number_required");
      if (!r.bank.trim()) throw new DomainError("bank_required");
    }
  }
  const secAmount = v.securityAmount?.trim() ? parseOMR(v.securityAmount) : null;
  if (v.securityAmount?.trim() && (secAmount === null || secAmount <= 0)) throw new DomainError("invalid_amount", {}, "securityAmount");
  const signedDocFileId = await upload(form, "signedDoc", c.ctx, "contract");
  const securityScan = await upload(form, "securityScan", c.ctx, "cheque_scan");
  const contract = await createContract(
    c.db,
    c.ctx,
    {
      unitId: v.unitId,
      tenantId: v.tenantId,
      startDate: v.startDate,
      endDate: v.endDate,
      monthlyRentBaisa: v.monthlyRent,
      paymentFrequency: v.paymentFrequency,
      cheques,
      security: secAmount ? { amountBaisa: secAmount, chequeNumber: v.securityNumber || null, bank: v.securityBank || null, chequeDate: v.securityDate && isValidISO(v.securityDate) ? v.securityDate : null, scanFileId: securityScan } : null,
      signedDocFileId,
      sanadReference: v.sanadReference || null,
      electricityAccount: v.electricityAccount,
      waterAccount: v.waterAccount,
      notes: v.notes || null,
      previousContractId: v.previousContractId || null,
    },
    { capOverrideReason: v.capOverrideReason },
  );
  return { message: v.previousContractId ? "msg.contract_renewed" : "msg.contract_created", redirectTo: `/contracts/${contract.id}` };
});

export const giveNoticeAction = staffAction("contracts:manage", async ({ c, form, t }) => {
  const v = parseForm(z.object({ id: uuid, noticeGivenOn: date, moveOutDate: date }), form, t);
  await giveNotice(c.db, c.ctx, v.id, { noticeGivenOn: v.noticeGivenOn, moveOutDate: v.moveOutDate });
  return { message: "msg.notice_given", revalidate: [`/contracts/${v.id}`, "/dashboard", "/units"] };
});

export const withdrawNoticeAction = staffAction("contracts:manage", async ({ c, form, t }) => {
  const { id } = parseForm(z.object({ id: uuid }), form, t);
  await withdrawNotice(c.db, c.ctx, id);
  return { message: "msg.notice_withdrawn", revalidate: [`/contracts/${id}`, "/units"] };
});

export const completeMoveOutAction = staffAction("contracts:manage", async ({ c, form, t }) => {
  const { id } = parseForm(z.object({ id: uuid }), form, t);
  await completeMoveOut(c.db, c.ctx, id);
  return { message: "msg.moved_out", redirectTo: `/contracts/${id}` };
});

export const activateContractAction = staffAction("contracts:manage", async ({ c, form, t }) => {
  const { id } = parseForm(z.object({ id: uuid }), form, t);
  await activateContract(c.db, c.ctx, id);
  return { message: "msg.contract_activated", revalidate: [`/contracts/${id}`, "/units"] };
});

export const cancelContractAction = staffAction("contracts:manage", async ({ c, form, t }) => {
  const v = parseForm(z.object({ id: uuid, reason: z.string().min(3, "err.reason_required") }), form, t);
  await cancelPendingContract(c.db, c.ctx, v.id, v.reason);
  return { message: "msg.contract_cancelled", redirectTo: "/contracts" };
});

export const resolveDepositAction = staffAction("contracts:manage", async ({ c, form, t }) => {
  const v = parseForm(z.object({ id: uuid, resolution: z.enum(["returned", "applied"]), note: z.string().min(3, "err.reason_required") }), form, t);
  await resolveSecurityDeposit(c.db, c.ctx, v.id, { resolution: v.resolution, note: v.note });
  return { message: "msg.saved", revalidate: [`/contracts/${v.id}`] };
});

export const addChequeAction = staffAction("cheques:record", async ({ c, form, t }) => {
  const v = parseForm(z.object({ itemId: uuid, chequeNumber: z.string().min(1, "err.cheque_number_required"), bank: z.string().min(1, "err.bank_required"), chequeDate: date, amount: money, contractId: uuid }), form, t);
  const scanFileId = await upload(form, "scan", c.ctx, "cheque_scan");
  await addChequeToItem(c.db, c.ctx, { scheduleItemId: v.itemId, chequeNumber: v.chequeNumber, bank: v.bank, chequeDate: v.chequeDate, amountBaisa: v.amount, scanFileId });
  return { message: "msg.cheque_added", revalidate: [`/contracts/${v.contractId}`, "/cheques"] };
});

export const sendPaymentLinkAction = staffAction("payments:record", async ({ c, form, t }) => {
  const v = parseForm(z.object({ itemId: uuid, contractId: uuid }), form, t);
  const [item] = await c.db.select().from(scheduleItems).where(and(eq(scheduleItems.id, v.itemId), eq(scheduleItems.orgId, c.ctx.orgId)));
  if (!item) throw new NotFoundError("schedule_item");
  const [tenant] = await c.db.select().from(tenants).where(eq(tenants.id, item.tenantId));
  const [org] = await c.db.select().from(organisations).where(eq(organisations.id, c.ctx.orgId));
  if (!org.onlinePaymentsEnabled) throw new DomainError("online_payments_disabled");
  await notifyTenant(c.db, {
    orgId: c.ctx.orgId,
    tenantId: tenant.id,
    template: "payment_link",
    vars: { org: tenant.locale === "ar" ? (org.nameAr ?? org.name) : org.name, amount: formatOMR(item.amountBaisa, tenant.locale), date: formatDate(item.dueDate, tenant.locale), link: `${await getBaseUrl()}/portal/schedule` },
    idempotencyKey: `paylink:${item.id}:${Date.now()}`,
    link: "/portal/schedule",
  });
  return { message: "msg.payment_link_sent", revalidate: ["/notifications"] };
});

export const updateContractAction = staffAction("contracts:manage", async ({ c, form, t }) => {
  const v = parseForm(z.object({ id: uuid, sanadReference: z.string().optional(), notes: z.string().optional(), electricityAccount: z.string().optional(), waterAccount: z.string().optional() }), form, t);
  const signedDocFileId = await upload(form, "signedDoc", c.ctx, "contract");
  await updateContractDocs(c.db, c.ctx, v.id, { sanadReference: v.sanadReference?.trim() || null, notes: v.notes?.trim() || null, electricityAccount: v.electricityAccount ?? null, waterAccount: v.waterAccount ?? null, ...(signedDocFileId ? { signedDocFileId } : {}) });
  return { message: "msg.saved", revalidate: [`/contracts/${v.id}`] };
});

export const attachScanAction = staffAction(null, async ({ c, form, t }) => {
  const v = parseForm(z.object({ id: uuid }), form, t);
  const fileId = await upload(form, "scan", c.ctx, "cheque_scan");
  if (!fileId) throw new DomainError("file_empty", {}, "scan");
  await attachChequeScan(c.db, c.ctx, v.id, fileId);
  return { message: "msg.scan_attached", revalidate: ["/cheques"] };
});

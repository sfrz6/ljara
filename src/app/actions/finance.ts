"use server";

import { z } from "zod";
import { voidReceipt, recordManualPayment } from "@/domain/payments";
import { generateAllStatements, generateStatement } from "@/domain/statements";
import { parseForm, staffAction } from "@/lib/action";
import { isValidISO } from "@/lib/dates";

export const voidReceiptAction = staffAction("receipts:void", async ({ c, form, t }) => {
  const v = parseForm(z.object({ id: z.string().uuid(), reason: z.string().min(3, "err.reason_required") }), form, t);
  await voidReceipt(c.db, c.ctx, v.id, v.reason);
  return { message: "msg.receipt_voided", revalidate: ["/receipts", "/cheques", "/dashboard"] };
});

export const manualPaymentAction = staffAction("payments:record", async ({ c, form, t }) => {
  const v = parseForm(z.object({ itemId: z.string().uuid(), method: z.enum(["cash", "bank_transfer"]), reference: z.string().optional() }), form, t);
  await recordManualPayment(c.db, c.ctx, { scheduleItemId: v.itemId, method: v.method, reference: v.reference });
  return { message: "msg.payment_recorded", revalidate: ["/receipts", "/contracts", "/dashboard"] };
});

const range = z.object({
  from: z.string().refine(isValidISO, "err.invalid_date"),
  to: z.string().refine(isValidISO, "err.invalid_date"),
  locale: z.enum(["en", "ar"]),
});

export const generateStatementAction = staffAction("statements:generate", async ({ c, form, t }) => {
  const v = parseForm(range.extend({ ownerId: z.string().uuid("err.required") }), form, t);
  const st = await generateStatement(c.db, c.ctx, { ownerId: v.ownerId, from: v.from, to: v.to, locale: v.locale });
  return { message: "msg.statement_generated", redirectTo: `/statements/${st.id}` };
});

export const generateAllStatementsAction = staffAction("statements:generate", async ({ c, form, t }) => {
  const v = parseForm(range, form, t);
  const res = await generateAllStatements(c.db, c.ctx, v);
  return { message: "msg.statements_generated", revalidate: ["/statements"], data: { created: res.created.length, skipped: res.skipped } };
});

"use server";

import { z } from "zod";
import { bounceCheque, collectCheque, depositCheque, recoverCheque, startFollowUp, writeOffCheque } from "@/domain/cheques";
import { parseForm, staffAction } from "@/lib/action";

const id = z.object({ id: z.string().uuid("err.not_found") });
const reason = z.object({ id: z.string().uuid("err.not_found"), reason: z.string().min(2, "err.reason_required") });

export const depositAction = staffAction("cheques:process", async ({ c, form, t }) => {
  const { id: chequeId } = parseForm(id, form, t);
  await depositCheque(c.db, c.ctx, chequeId);
  return { message: "msg.cheque_deposited", revalidate: ["/cheques", "/dashboard"] };
});

export const collectAction = staffAction("cheques:process", async ({ c, form, t }) => {
  const { id: chequeId } = parseForm(id, form, t);
  await collectCheque(c.db, c.ctx, chequeId);
  return { message: "msg.cheque_collected", revalidate: ["/cheques", "/dashboard", "/receipts"] };
});

export const bounceAction = staffAction("cheques:process", async ({ c, form, t }) => {
  const v = parseForm(reason, form, t);
  await bounceCheque(c.db, c.ctx, v.id, v.reason);
  return { message: "msg.cheque_bounced", revalidate: ["/cheques", "/dashboard"] };
});

export const followUpAction = staffAction("cheques:process", async ({ c, form, t }) => {
  const v = parseForm(z.object({ id: z.string().uuid(), note: z.string().min(2, "err.reason_required") }), form, t);
  await startFollowUp(c.db, c.ctx, v.id, v.note);
  return { message: "msg.followup_started", revalidate: ["/cheques", "/dashboard"] };
});

export const recoverAction = staffAction("cheques:process", async ({ c, form, t }) => {
  const v = parseForm(z.object({ id: z.string().uuid(), method: z.enum(["cheque", "cash", "bank_transfer"]), reference: z.string().optional() }), form, t);
  await recoverCheque(c.db, c.ctx, v.id, { method: v.method, reference: v.reference });
  return { message: "msg.cheque_collected", revalidate: ["/cheques", "/dashboard", "/receipts"] };
});

export const writeOffAction = staffAction("cheques:writeoff", async ({ c, form, t }) => {
  const v = parseForm(reason, form, t);
  await writeOffCheque(c.db, c.ctx, v.id, v.reason);
  return { message: "msg.cheque_written_off", revalidate: ["/cheques", "/dashboard"] };
});

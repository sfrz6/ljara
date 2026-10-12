"use server";

import { z } from "zod";
import { getDb } from "@/db/client";
import {
  addInternalNote, assignRequest, completeRequest, correctCost, decideInspection, logCost, markSeen, performInspection, startWork, submitRequest,
} from "@/domain/maintenance";
import { parseForm, staffAction, tenantAction } from "@/lib/action";
import { parseOMR } from "@/lib/money";
import { saveFile } from "@/lib/storage";
import { DomainError } from "@/domain/errors";
import type { Ctx } from "@/domain/context";

async function savePhotos(form: FormData, ctx: Ctx, category: "maintenance_photo" | "inspection_photo" = "maintenance_photo"): Promise<string[]> {
  const db = await getDb();
  const ids: string[] = [];
  for (const f of form.getAll("photos")) {
    if (typeof f === "string" || f.size === 0) continue;
    ids.push(await saveFile(db, { orgId: ctx.orgId, name: f.name, data: Buffer.from(await f.arrayBuffer()), category, createdBy: ctx.actor.id }));
  }
  return ids;
}

const uuid = z.string().uuid("err.not_found");
const cost = z.string().transform((v, c) => {
  const n = parseOMR(v);
  if (n === null || n < 0) {
    c.addIssue({ code: "custom", message: "err.invalid_amount" });
    return z.NEVER;
  }
  return n;
});

const newReq = z.object({
  unitId: z.string().optional(),
  tenantId: z.string().optional(),
  title: z.string().min(3, "err.title_required"),
  description: z.string().min(5, "err.description_required"),
  priority: z.enum(["normal", "urgent"]),
  categoryId: z.string().optional(),
});

export const submitStaffRequestAction = staffAction("maintenance:create", async ({ c, form, t }) => {
  const v = parseForm(newReq, form, t);
  if (!v.unitId) throw new DomainError("unit_required", {}, "unitId");
  const photoFileIds = await savePhotos(form, c.ctx);
  const r = await submitRequest(c.db, c.ctx, { unitId: v.unitId, tenantId: v.tenantId || null, title: v.title, description: v.description, priority: v.priority, categoryId: v.categoryId || null, photoFileIds });
  return { message: "msg.request_submitted", redirectTo: `/maintenance/${r.id}` };
});

export const submitTenantRequestAction = tenantAction(async ({ c, form, t }) => {
  const v = parseForm(newReq, form, t);
  const photoFileIds = await savePhotos(form, c.ctx);
  const r = await submitRequest(c.db, c.ctx, { title: v.title, description: v.description, priority: v.priority, categoryId: v.categoryId || null, photoFileIds });
  return { message: "msg.request_submitted", redirectTo: `/portal/maintenance/${r.id}` };
});

export const seenAction = staffAction("maintenance:manage", async ({ c, form, t }) => {
  await markSeen(c.db, c.ctx, parseForm(z.object({ id: uuid }), form, t).id);
  return { message: "msg.request_updated", revalidate: ["/maintenance"] };
});

export const assignAction = staffAction("maintenance:manage", async ({ c, form, t }) => {
  const v = parseForm(z.object({ id: uuid, assigneeId: z.string().uuid("err.assignee_invalid") }), form, t);
  await assignRequest(c.db, c.ctx, v.id, v.assigneeId);
  return { message: "msg.request_assigned", revalidate: ["/maintenance"] };
});

export const startAction = staffAction(null, async ({ c, form, t }) => {
  await startWork(c.db, c.ctx, parseForm(z.object({ id: uuid }), form, t).id);
  return { message: "msg.request_updated", revalidate: ["/maintenance"] };
});

export const completeAction = staffAction(null, async ({ c, form, t }) => {
  const v = parseForm(z.object({ id: uuid, categoryId: z.string().min(1, "err.category_required"), workPerformed: z.string().min(3, "err.work_required"), technicianNotes: z.string().optional(), cost: z.string().optional() }), form, t);
  const costBaisa = v.cost && v.cost.trim() !== "" ? parseOMR(v.cost) : null;
  if (v.cost && v.cost.trim() !== "" && (costBaisa === null || costBaisa < 0)) throw new DomainError("invalid_amount", {}, "cost");
  const photoFileIds = await savePhotos(form, c.ctx);
  await completeRequest(c.db, c.ctx, v.id, { categoryId: v.categoryId, workPerformed: v.workPerformed, technicianNotes: v.technicianNotes ?? null, costBaisa, photoFileIds });
  return { message: costBaisa === null ? "msg.request_completed_no_cost" : "msg.request_posted", revalidate: ["/maintenance", "/dashboard"] };
});

export const costAction = staffAction(null, async ({ c, form, t }) => {
  const v = parseForm(z.object({ id: uuid, cost }), form, t);
  await logCost(c.db, c.ctx, v.id, v.cost);
  return { message: "msg.request_posted", revalidate: ["/maintenance", "/dashboard"] };
});

export const correctCostAction = staffAction("maintenance:costs", async ({ c, form, t }) => {
  const v = parseForm(z.object({ id: uuid, cost, reason: z.string().min(3, "err.reason_required") }), form, t);
  await correctCost(c.db, c.ctx, v.id, v.cost, v.reason);
  return { message: "msg.request_updated", revalidate: ["/maintenance"] };
});

export const noteAction = staffAction(null, async ({ c, form, t }) => {
  const v = parseForm(z.object({ id: uuid, note: z.string().min(2, "err.note_required") }), form, t);
  await addInternalNote(c.db, c.ctx, v.id, v.note);
  return { message: "msg.note_added", revalidate: ["/maintenance"] };
});

export const inspectAction = staffAction("inspections:perform", async ({ c, form, t }) => {
  const v = parseForm(z.object({ id: uuid, condition: z.enum(["good", "fair", "needs_work"]), findings: z.string().min(3, "err.findings_required") }), form, t);
  const photoFileIds = await savePhotos(form, c.ctx, "inspection_photo");
  await performInspection(c.db, c.ctx, v.id, { condition: v.condition, findings: v.findings, photoFileIds });
  return { message: "msg.inspection_done", revalidate: ["/inspections", "/dashboard", "/units"] };
});

export const decideInspectionAction = staffAction("inspections:approve", async ({ c, form, t }) => {
  const v = parseForm(z.object({ id: uuid, decision: z.enum(["approve", "reject"]), note: z.string().optional() }), form, t);
  await decideInspection(c.db, c.ctx, v.id, v.decision, v.note);
  return { message: v.decision === "approve" ? "msg.inspection_approved" : "msg.inspection_rejected", revalidate: ["/inspections", "/dashboard", "/units"] };
});

"use server";

import { z } from "zod";
import { getDb } from "@/db/client";
import {
  addInternalNote, assignRequest, completeRequest, decideInspection, performInspection, putOnHold, setCost, startWork, submitRequest,
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

export const assignAction = staffAction("maintenance:manage", async ({ c, form, t }) => {
  const v = parseForm(z.object({ id: uuid, assigneeId: z.string().uuid("err.assignee_invalid") }), form, t);
  await assignRequest(c.db, c.ctx, v.id, v.assigneeId);
  return { message: "msg.request_assigned", revalidate: ["/maintenance"] };
});

export const startAction = staffAction(null, async ({ c, form, t }) => {
  await startWork(c.db, c.ctx, parseForm(z.object({ id: uuid }), form, t).id);
  return { message: "msg.request_started", revalidate: ["/maintenance", "/dashboard"] };
});

export const holdAction = staffAction(null, async ({ c, form, t }) => {
  const v = parseForm(z.object({ id: uuid, note: z.string().min(3, "err.note_required") }), form, t);
  await putOnHold(c.db, c.ctx, v.id, v.note);
  return { message: "msg.request_on_hold", revalidate: ["/maintenance", "/dashboard"] };
});

/** Cost is optional: filled when the office paid for the repair, empty when the tenant is responsible. */
function optionalCost(raw: string | undefined): number | null {
  if (!raw || raw.trim() === "") return null;
  const n = parseOMR(raw);
  if (n === null || n < 0) throw new DomainError("invalid_amount", {}, "cost");
  return n;
}

export const completeAction = staffAction(null, async ({ c, form, t }) => {
  const v = parseForm(
    z.object({ id: uuid, categoryId: z.string().min(1, "err.category_required"), workPerformed: z.string().min(3, "err.work_required"), tenantNote: z.string().optional(), technicianNotes: z.string().optional(), cost: z.string().optional() }),
    form,
    t,
  );
  const costBaisa = optionalCost(v.cost);
  const photoFileIds = await savePhotos(form, c.ctx);
  await completeRequest(c.db, c.ctx, v.id, { categoryId: v.categoryId, workPerformed: v.workPerformed, tenantNote: v.tenantNote ?? null, technicianNotes: v.technicianNotes ?? null, costBaisa, photoFileIds });
  return { message: costBaisa === null ? "msg.request_completed" : "msg.request_completed_cost", revalidate: ["/maintenance", "/dashboard"] };
});

export const costAction = staffAction(null, async ({ c, form, t }) => {
  const v = parseForm(z.object({ id: uuid, cost: z.string().optional(), reason: z.string().optional() }), form, t);
  await setCost(c.db, c.ctx, v.id, optionalCost(v.cost), v.reason);
  return { message: "msg.request_updated", revalidate: ["/maintenance", "/dashboard"] };
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

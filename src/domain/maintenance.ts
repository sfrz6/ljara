import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import {
  attachments,
  buildings,
  contracts,
  inspections,
  maintenanceCategories,
  maintenanceEvents,
  maintenanceRequests,
  tenants,
  units,
  users,
} from "@/db/schema";
import { addMonths, todayISO } from "@/lib/dates";
import { writeAudit } from "./audit";
import { machineActor, type Ctx } from "./context";
import { DomainError, NotFoundError } from "./errors";
import { assertTransition, maintenanceMachine, type MaintenanceStatus } from "./machines";
import { notifyStaff, notifyTenant } from "./notifications";
import { assertCan, type Role } from "./permissions";
import { transitionUnit } from "./portfolio";
import { nextSequence } from "./sequences";

const role = (ctx: Ctx) => ctx.actor.role as Role;
const isTenant = (ctx: Ctx) => ctx.actor.kind === "tenant";

async function logEvent(
  q: DB,
  ctx: Ctx,
  requestId: string,
  status: MaintenanceStatus,
  note?: string | null,
  internal = false,
) {
  await q.insert(maintenanceEvents).values({
    orgId: ctx.orgId,
    requestId,
    status,
    actorName: ctx.actor.name,
    actorKind: ctx.actor.kind,
    note: note ?? null,
    internal,
  });
}

async function load(q: DB, ctx: Ctx, requestId: string) {
  const [r] = await q
    .select()
    .from(maintenanceRequests)
    .where(and(eq(maintenanceRequests.id, requestId), eq(maintenanceRequests.orgId, ctx.orgId)));
  if (!r) throw new NotFoundError("maintenance_request");
  return r;
}

async function step(q: DB, ctx: Ctx, r: typeof maintenanceRequests.$inferSelect, to: MaintenanceStatus, patch: Partial<typeof maintenanceRequests.$inferInsert>, note?: string) {
  assertTransition(maintenanceMachine, r.status as MaintenanceStatus, to, machineActor(ctx));
  const upd = await q
    .update(maintenanceRequests)
    .set({ ...patch, status: to, updatedAt: new Date() })
    .where(and(eq(maintenanceRequests.id, r.id), eq(maintenanceRequests.status, r.status)))
    .returning();
  if (upd.length === 0) throw new DomainError("concurrent_change");
  await logEvent(q, ctx, r.id, to, note);
  await writeAudit(q, ctx, {
    action: "maintenance.status_changed",
    entityType: "maintenance_request",
    entityId: r.id,
    before: { status: r.status },
    after: { status: to },
  });
  return upd[0];
}

export interface RequestInput {
  /** Staff supply the unit. Tenants never do: it is derived from their own active contract. */
  unitId?: string;
  tenantId?: string | null;
  title: string;
  description: string;
  priority: "normal" | "urgent";
  categoryId?: string | null;
  photoFileIds?: string[];
}

export async function submitRequest(db: DB, ctx: Ctx, input: RequestInput) {
  if (isTenant(ctx)) {
    /* tenant may always submit for their own unit */
  } else assertCan(role(ctx), "maintenance:create");
  const title = input.title.trim();
  const description = input.description.trim();
  if (title.length < 3) throw new DomainError("title_required", {}, "title");
  if (description.length < 5) throw new DomainError("description_required", {}, "description");
  if ((input.photoFileIds?.length ?? 0) > 5) throw new DomainError("too_many_photos");

  return db.transaction(async (tx0) => {
    const tx = tx0 as unknown as DB;
    let unitId = input.unitId;
    let tenantId = input.tenantId ?? null;
    if (isTenant(ctx)) {
      tenantId = ctx.actor.id;
      const [c] = await tx
        .select()
        .from(contracts)
        .where(and(eq(contracts.tenantId, tenantId!), eq(contracts.orgId, ctx.orgId), inArray(contracts.status, ["active", "pending"])))
        .orderBy(desc(contracts.startDate))
        .limit(1);
      if (!c) throw new DomainError("no_active_contract");
      unitId = c.unitId;
    }
    if (!unitId) throw new DomainError("unit_required", {}, "unitId");
    const [unit] = await tx.select().from(units).where(and(eq(units.id, unitId), eq(units.orgId, ctx.orgId)));
    if (!unit) throw new NotFoundError("unit");
    if (input.categoryId) {
      const [cat] = await tx
        .select({ id: maintenanceCategories.id })
        .from(maintenanceCategories)
        .where(and(eq(maintenanceCategories.id, input.categoryId), eq(maintenanceCategories.orgId, ctx.orgId)));
      if (!cat) throw new NotFoundError("category");
    }
    if (tenantId && !isTenant(ctx)) {
      const [t] = await tx.select({ id: tenants.id }).from(tenants).where(and(eq(tenants.id, tenantId), eq(tenants.orgId, ctx.orgId)));
      if (!t) throw new NotFoundError("tenant");
    }

    const year = todayISO().slice(0, 4);
    const seq = await nextSequence(tx, ctx.orgId, `maint:${ctx.orgId}:${year}`);
    const reference = `MR-${year}-${String(seq).padStart(4, "0")}`;
    const [row] = await tx
      .insert(maintenanceRequests)
      .values({
        orgId: ctx.orgId,
        reference,
        unitId: unit.id,
        buildingId: unit.buildingId,
        ownerId: unit.ownerId,
        tenantId,
        title,
        description,
        priority: input.priority,
        categoryId: input.categoryId ?? null,
        createdByUserId: isTenant(ctx) ? null : ctx.actor.id,
      })
      .returning();
    for (const fileId of input.photoFileIds ?? []) {
      await tx.insert(attachments).values({
        orgId: ctx.orgId,
        fileId,
        entityType: "maintenance_request",
        entityId: row.id,
        kind: "photo",
      });
    }
    await logEvent(tx, ctx, row.id, "submitted", null);
    await writeAudit(tx, ctx, { action: "maintenance.submitted", entityType: "maintenance_request", entityId: row.id, after: row });

    await notifyStaff(tx, {
      orgId: ctx.orgId,
      roles: ["manager", "maintenance"],
      template: "maintenance_new",
      vars: { reference, unit: unit.label, title },
      idempotencyKey: `maint_new:${row.id}`,
      link: `/maintenance/${row.id}`,
      related: { type: "maintenance_request", id: row.id },
      pref: "maintenanceNew",
    });
    if (tenantId) {
      await notifyTenant(tx, {
        orgId: ctx.orgId,
        tenantId,
        template: "maintenance_received",
        vars: { reference, title },
        idempotencyKey: `maint_received:${row.id}`,
        link: `/portal/maintenance/${row.id}`,
        related: { type: "maintenance_request", id: row.id },
      });
    }
    return row;
  });
}

export async function markSeen(db: DB, ctx: Ctx, requestId: string) {
  assertCan(role(ctx), "maintenance:manage");
  const r = await load(db, ctx, requestId);
  return step(db, ctx, r, "seen", { seenAt: new Date() });
}

/** Assign to a maintenance team member. From "submitted" this records "seen by manager" first, as the workflow requires. */
export async function assignRequest(db: DB, ctx: Ctx, requestId: string, assigneeId: string, note?: string) {
  assertCan(role(ctx), "maintenance:manage");
  return db.transaction(async (tx0) => {
    const tx = tx0 as unknown as DB;
    let r = await load(tx, ctx, requestId);
    const [assignee] = await tx
      .select()
      .from(users)
      .where(and(eq(users.id, assigneeId), eq(users.orgId, ctx.orgId), eq(users.active, true), eq(users.role, "maintenance")));
    if (!assignee) throw new DomainError("assignee_invalid", {}, "assigneeId");
    if (r.status === "submitted") r = await step(tx, ctx, r, "seen", { seenAt: new Date() });
    if (r.status === "assigned") {
      // Re-assignment keeps the state; only the technician changes.
      await tx
        .update(maintenanceRequests)
        .set({ assignedToUserId: assignee.id, assignedAt: new Date(), updatedAt: new Date() })
        .where(eq(maintenanceRequests.id, r.id));
      await writeAudit(tx, ctx, {
        action: "maintenance.reassigned",
        entityType: "maintenance_request",
        entityId: r.id,
        before: { assignedTo: r.assignedToUserId },
        after: { assignedTo: assignee.id },
      });
      await logEvent(tx, ctx, r.id, "assigned", `Reassigned to ${assignee.name}`, true);
    } else {
      r = await step(tx, ctx, r, "assigned", { assignedToUserId: assignee.id, assignedAt: new Date() }, note);
    }
    const [unit] = await tx.select().from(units).where(eq(units.id, r.unitId));
    await notifyStaff(tx, {
      orgId: ctx.orgId,
      roles: ["maintenance"],
      userIds: [assignee.id],
      template: "maintenance_assigned",
      vars: { reference: r.reference, unit: unit.label, title: r.title },
      idempotencyKey: `maint_assigned:${r.id}:${assignee.id}`,
      link: `/maintenance/${r.id}`,
      related: { type: "maintenance_request", id: r.id },
    });
    return r;
  });
}

function assertCanWork(ctx: Ctx, r: typeof maintenanceRequests.$inferSelect) {
  const rl = role(ctx);
  if (rl === "manager") return;
  assertCan(rl, "maintenance:work");
  if (r.assignedToUserId !== ctx.actor.id) throw new DomainError("not_assigned_to_you");
}

export async function startWork(db: DB, ctx: Ctx, requestId: string) {
  const r = await load(db, ctx, requestId);
  assertCanWork(ctx, r);
  return db.transaction(async (tx0) => {
    const tx = tx0 as unknown as DB;
    const next = await step(tx, ctx, r, "in_progress", { startedAt: new Date() });
    if (r.tenantId) {
      await notifyTenant(tx, {
        orgId: ctx.orgId,
        tenantId: r.tenantId,
        template: "maintenance_in_progress",
        vars: { reference: r.reference, title: r.title },
        idempotencyKey: `maint_progress:${r.id}`,
        link: `/portal/maintenance/${r.id}`,
        related: { type: "maintenance_request", id: r.id },
      });
    }
    return next;
  });
}

export interface CompleteInput {
  categoryId: string;
  workPerformed: string;
  technicianNotes?: string | null;
  /** Optional: when supplied the request is taken straight through cost logged and posted. Zero is allowed. */
  costBaisa?: number | null;
  photoFileIds?: string[];
}

export async function completeRequest(db: DB, ctx: Ctx, requestId: string, input: CompleteInput) {
  const r0 = await load(db, ctx, requestId);
  assertCanWork(ctx, r0);
  if (!input.categoryId) throw new DomainError("category_required", {}, "categoryId");
  if (input.workPerformed.trim().length < 3) throw new DomainError("work_required", {}, "workPerformed");
  if (input.costBaisa !== null && input.costBaisa !== undefined && (!Number.isSafeInteger(input.costBaisa) || input.costBaisa < 0)) {
    throw new DomainError("invalid_amount", {}, "cost");
  }
  return db.transaction(async (tx0) => {
    const tx = tx0 as unknown as DB;
    const [cat] = await tx
      .select({ id: maintenanceCategories.id })
      .from(maintenanceCategories)
      .where(and(eq(maintenanceCategories.id, input.categoryId), eq(maintenanceCategories.orgId, ctx.orgId)));
    if (!cat) throw new NotFoundError("category");
    let r = await step(tx, ctx, r0, "completed", {
      categoryId: input.categoryId,
      workPerformed: input.workPerformed.trim(),
      technicianNotes: input.technicianNotes ?? null,
      completedAt: new Date(),
      completedOn: todayISO(),
    });
    for (const fileId of input.photoFileIds ?? []) {
      await tx.insert(attachments).values({
        orgId: ctx.orgId,
        fileId,
        entityType: "maintenance_request",
        entityId: r.id,
        kind: "work_photo",
        internal: true,
      });
    }
    if (r.tenantId) {
      await notifyTenant(tx, {
        orgId: ctx.orgId,
        tenantId: r.tenantId,
        template: "maintenance_completed",
        vars: { reference: r.reference, title: r.title },
        idempotencyKey: `maint_done:${r.id}`,
        link: `/portal/maintenance/${r.id}`,
        related: { type: "maintenance_request", id: r.id },
      });
    }
    if (input.costBaisa !== null && input.costBaisa !== undefined) {
      r = await logCostInternal(tx, ctx, r, input.costBaisa);
    }
    return r;
  });
}

async function logCostInternal(tx: DB, ctx: Ctx, r: typeof maintenanceRequests.$inferSelect, costBaisa: number) {
  let next = await step(tx, ctx, r, "cost_logged", { costBaisa, costLoggedAt: new Date() });
  // The cost flows into owner reporting automatically: no second entry (CR-7.5).
  next = await step(tx, { ...ctx, actor: { kind: "system", id: null, name: "System", role: "system" } }, next, "posted", { postedAt: new Date() });
  return next;
}

/** Record the cost of a completed request. Zero is a valid cost. Posts to the owner report automatically. */
export async function logCost(db: DB, ctx: Ctx, requestId: string, costBaisa: number) {
  const r = await load(db, ctx, requestId);
  if (role(ctx) !== "manager") assertCan(role(ctx), "maintenance:work");
  if (role(ctx) !== "manager" && r.assignedToUserId !== ctx.actor.id) throw new DomainError("not_assigned_to_you");
  if (!Number.isSafeInteger(costBaisa) || costBaisa < 0) throw new DomainError("invalid_amount", {}, "cost");
  return db.transaction(async (tx) => logCostInternal(tx as unknown as DB, ctx, r, costBaisa));
}

/** Manager correction of a posted cost. Audited with before and after; the owner report follows automatically. */
export async function correctCost(db: DB, ctx: Ctx, requestId: string, costBaisa: number, reason: string) {
  assertCan(role(ctx), "maintenance:costs");
  const r = await load(db, ctx, requestId);
  if (r.status !== "posted") throw new DomainError("cost_not_posted");
  if (!Number.isSafeInteger(costBaisa) || costBaisa < 0) throw new DomainError("invalid_amount", {}, "cost");
  if (reason.trim().length < 3) throw new DomainError("reason_required", {}, "reason");
  await db.update(maintenanceRequests).set({ costBaisa, updatedAt: new Date() }).where(eq(maintenanceRequests.id, r.id));
  await writeAudit(db, ctx, {
    action: "maintenance.cost_corrected",
    entityType: "maintenance_request",
    entityId: r.id,
    before: { costBaisa: r.costBaisa },
    after: { costBaisa },
    meta: { reason },
    elevated: true,
  });
  await logEvent(db, ctx, r.id, "posted", `Cost corrected: ${reason}`, true);
}

export async function addInternalNote(db: DB, ctx: Ctx, requestId: string, note: string) {
  if (role(ctx) !== "manager") assertCan(role(ctx), "maintenance:work");
  const r = await load(db, ctx, requestId);
  if (note.trim().length < 2) throw new DomainError("note_required", {}, "note");
  await logEvent(db, ctx, r.id, r.status as MaintenanceStatus, note.trim(), true);
}

export async function addPhotos(db: DB, ctx: Ctx, requestId: string, fileIds: string[]) {
  const r = await load(db, ctx, requestId);
  if (isTenant(ctx) && r.tenantId !== ctx.actor.id) throw new NotFoundError("maintenance_request");
  const existing = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(attachments)
    .where(and(eq(attachments.entityId, r.id), eq(attachments.entityType, "maintenance_request"), eq(attachments.kind, "photo")));
  if ((existing[0]?.n ?? 0) + fileIds.length > 5) throw new DomainError("too_many_photos");
  for (const fileId of fileIds) {
    await db.insert(attachments).values({ orgId: ctx.orgId, fileId, entityType: "maintenance_request", entityId: r.id, kind: "photo" });
  }
}

/* ------------------------------ Inspections ------------------------------ */

export async function performInspection(
  db: DB,
  ctx: Ctx,
  inspectionId: string,
  input: { condition: "good" | "fair" | "needs_work"; findings: string; photoFileIds?: string[] },
) {
  assertCan(role(ctx), "inspections:perform");
  if (input.findings.trim().length < 3) throw new DomainError("findings_required", {}, "findings");
  return db.transaction(async (tx0) => {
    const tx = tx0 as unknown as DB;
    const [ins] = await tx.select().from(inspections).where(and(eq(inspections.id, inspectionId), eq(inspections.orgId, ctx.orgId)));
    if (!ins) throw new NotFoundError("inspection");
    if (ins.status !== "pending") throw new DomainError("inspection_not_pending");
    await transitionUnit(tx, ctx, ins.unitId, "inspected");
    await tx
      .update(inspections)
      .set({ status: "inspected", condition: input.condition, findings: input.findings.trim(), inspectedBy: ctx.actor.id, inspectedAt: new Date() })
      .where(eq(inspections.id, ins.id));
    for (const fileId of input.photoFileIds ?? []) {
      await tx.insert(attachments).values({ orgId: ctx.orgId, fileId, entityType: "inspection", entityId: ins.id, kind: "photo", internal: true });
    }
    await writeAudit(tx, ctx, {
      action: "inspection.completed",
      entityType: "inspection",
      entityId: ins.id,
      after: { condition: input.condition, findings: input.findings },
    });
    const [unit] = await tx.select().from(units).where(eq(units.id, ins.unitId));
    await notifyStaff(tx, {
      orgId: ctx.orgId,
      roles: ["manager"],
      template: "inspection_ready",
      vars: { unit: unit.label },
      idempotencyKey: `inspection_ready:${ins.id}`,
      link: `/units/${unit.id}`,
      related: { type: "inspection", id: ins.id },
    });
  });
}

/** Manager approval makes the unit available again. Rejection sends it back to maintenance. */
export async function decideInspection(db: DB, ctx: Ctx, inspectionId: string, decision: "approve" | "reject", note?: string) {
  assertCan(role(ctx), "inspections:approve");
  return db.transaction(async (tx0) => {
    const tx = tx0 as unknown as DB;
    const [ins] = await tx.select().from(inspections).where(and(eq(inspections.id, inspectionId), eq(inspections.orgId, ctx.orgId)));
    if (!ins) throw new NotFoundError("inspection");
    if (ins.status !== "inspected") throw new DomainError("inspection_not_ready");
    if (decision === "approve") {
      await transitionUnit(tx, ctx, ins.unitId, "available", { note: "inspection approved" });
      await tx
        .update(inspections)
        .set({ status: "approved", decidedBy: ctx.actor.id, decidedAt: new Date(), decisionNote: note ?? null })
        .where(eq(inspections.id, ins.id));
    } else {
      if (!note || note.trim().length < 3) throw new DomainError("reason_required", {}, "note");
      await transitionUnit(tx, ctx, ins.unitId, "under_inspection", { note: "inspection rejected" });
      await tx
        .update(inspections)
        .set({ status: "rejected", decidedBy: ctx.actor.id, decidedAt: new Date(), decisionNote: note })
        .where(eq(inspections.id, ins.id));
      await tx.insert(inspections).values({ orgId: ctx.orgId, unitId: ins.unitId, contractId: ins.contractId });
    }
    await writeAudit(tx, ctx, {
      action: decision === "approve" ? "inspection.approved" : "inspection.rejected",
      entityType: "inspection",
      entityId: ins.id,
      meta: { note: note ?? null },
    });
  });
}

/* ------------------------------ Insights ------------------------------ */

export interface RepeatFailure {
  unitId: string;
  unitLabel: string;
  buildingName: string;
  categoryKey: string;
  categoryName: string;
  categoryNameAr: string | null;
  count: number;
  totalCostBaisa: number;
}

/** Recurring fault types per unit over the last 12 months, so the office can advise replace over repair (CR-7.6). */
export async function repeatFailures(q: DB, orgId: string, minCount = 2): Promise<RepeatFailure[]> {
  const since = addMonths(todayISO(), -12);
  const rows = await q
    .select({
      unitId: maintenanceRequests.unitId,
      unitLabel: units.label,
      buildingName: buildings.nameEn,
      categoryKey: maintenanceCategories.key,
      categoryName: maintenanceCategories.nameEn,
      categoryNameAr: maintenanceCategories.nameAr,
      count: sql<number>`count(*)::int`,
      totalCostBaisa: sql<number>`coalesce(sum(${maintenanceRequests.costBaisa}), 0)::bigint`.mapWith(Number),
    })
    .from(maintenanceRequests)
    .innerJoin(units, eq(units.id, maintenanceRequests.unitId))
    .innerJoin(buildings, eq(buildings.id, maintenanceRequests.buildingId))
    .innerJoin(maintenanceCategories, eq(maintenanceCategories.id, maintenanceRequests.categoryId))
    .where(and(eq(maintenanceRequests.orgId, orgId), gte(maintenanceRequests.createdAt, new Date(since)), sql`${maintenanceRequests.categoryId} is not null`))
    .groupBy(maintenanceRequests.unitId, units.label, buildings.nameEn, maintenanceCategories.key, maintenanceCategories.nameEn, maintenanceCategories.nameAr)
    .having(sql`count(*) >= ${minCount}`)
    .orderBy(desc(sql`count(*)`));
  return rows;
}


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

/** Optional: a manager can hand a request to a specific technician. It is not a status; anyone on the team can still work it. */
export async function assignRequest(db: DB, ctx: Ctx, requestId: string, assigneeId: string) {
  assertCan(role(ctx), "maintenance:manage");
  return db.transaction(async (tx0) => {
    const tx = tx0 as unknown as DB;
    const r = await load(tx, ctx, requestId);
    if (r.status === "completed") throw new DomainError("invalid_transition", { machine: "maintenance", from: r.status, to: r.status });
    const [assignee] = await tx
      .select()
      .from(users)
      .where(and(eq(users.id, assigneeId), eq(users.orgId, ctx.orgId), eq(users.active, true), eq(users.role, "maintenance")));
    if (!assignee) throw new DomainError("assignee_invalid", {}, "assigneeId");
    await tx.update(maintenanceRequests).set({ assignedToUserId: assignee.id, assignedAt: new Date(), updatedAt: new Date() }).where(eq(maintenanceRequests.id, r.id));
    await writeAudit(tx, ctx, { action: "maintenance.assigned", entityType: "maintenance_request", entityId: r.id, before: { assignedTo: r.assignedToUserId }, after: { assignedTo: assignee.id } });
    await logEvent(tx, ctx, r.id, r.status as MaintenanceStatus, `Assigned to ${assignee.name}`, true);
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

/** The maintenance team or a manager can work any request in their office. */
function assertCanWork(ctx: Ctx) {
  const rl = role(ctx);
  if (rl === "manager") return;
  assertCan(rl, "maintenance:work");
}

async function tellTenant(tx: DB, ctx: Ctx, r: typeof maintenanceRequests.$inferSelect, template: string, extra: Record<string, string> = {}) {
  if (!r.tenantId) return;
  await notifyTenant(tx, {
    orgId: ctx.orgId,
    tenantId: r.tenantId,
    template,
    vars: { reference: r.reference, title: r.title, ...extra },
    idempotencyKey: `maint:${template}:${r.id}:${Date.now()}`,
    link: `/portal/maintenance/${r.id}`,
    related: { type: "maintenance_request", id: r.id },
  });
}

/** submitted or waiting -> in progress. Whoever starts becomes the person responsible if nobody is assigned. */
export async function startWork(db: DB, ctx: Ctx, requestId: string) {
  assertCanWork(ctx);
  return db.transaction(async (tx0) => {
    const tx = tx0 as unknown as DB;
    const r = await load(tx, ctx, requestId);
    const resuming = r.status === "waiting";
    const next = await step(tx, ctx, r, "in_progress", {
      startedAt: r.startedAt ?? new Date(),
      assignedToUserId: r.assignedToUserId ?? (ctx.actor.kind === "user" ? ctx.actor.id : null),
    });
    if (!resuming) await tellTenant(tx, ctx, r, "maintenance_in_progress");
    return next;
  });
}

/** in progress -> waiting. The note is shown to the tenant (for example "waiting for a spare part"). */
export async function putOnHold(db: DB, ctx: Ctx, requestId: string, note: string) {
  assertCanWork(ctx);
  const text = note.trim();
  if (text.length < 3) throw new DomainError("note_required", {}, "note");
  return db.transaction(async (tx0) => {
    const tx = tx0 as unknown as DB;
    const r = await load(tx, ctx, requestId);
    const next = await step(tx, ctx, r, "waiting", {}, text);
    await tellTenant(tx, ctx, r, "maintenance_waiting", { note: text });
    return next;
  });
}

export interface CompleteInput {
  categoryId: string;
  workPerformed: string;
  /** Optional message the tenant can read. */
  tenantNote?: string | null;
  technicianNotes?: string | null;
  /**
   * Cost paid by the office, in baisa. When set it is charged to the owner and reaches the manager's reports and the
   * owner statement automatically. Leave null when the tenant is responsible for the repair.
   */
  costBaisa?: number | null;
  photoFileIds?: string[];
}

export async function completeRequest(db: DB, ctx: Ctx, requestId: string, input: CompleteInput) {
  assertCanWork(ctx);
  if (!input.categoryId) throw new DomainError("category_required", {}, "categoryId");
  if (input.workPerformed.trim().length < 3) throw new DomainError("work_required", {}, "workPerformed");
  const cost = input.costBaisa ?? null;
  if (cost !== null && (!Number.isSafeInteger(cost) || cost < 0)) throw new DomainError("invalid_amount", {}, "cost");
  return db.transaction(async (tx0) => {
    const tx = tx0 as unknown as DB;
    const r0 = await load(tx, ctx, requestId);
    const [cat] = await tx
      .select({ id: maintenanceCategories.id })
      .from(maintenanceCategories)
      .where(and(eq(maintenanceCategories.id, input.categoryId), eq(maintenanceCategories.orgId, ctx.orgId)));
    if (!cat) throw new NotFoundError("category");
    const r = await step(
      tx,
      ctx,
      r0,
      "completed",
      {
        categoryId: input.categoryId,
        workPerformed: input.workPerformed.trim(),
        technicianNotes: input.technicianNotes ?? null,
        completedAt: new Date(),
        completedOn: todayISO(),
        costBaisa: cost,
        costLoggedAt: cost === null ? null : new Date(),
        postedAt: cost === null ? null : new Date(),
        assignedToUserId: r0.assignedToUserId ?? (ctx.actor.kind === "user" ? ctx.actor.id : null),
      },
      input.tenantNote?.trim() || undefined,
    );
    for (const fileId of input.photoFileIds ?? []) {
      await tx.insert(attachments).values({ orgId: ctx.orgId, fileId, entityType: "maintenance_request", entityId: r.id, kind: "work_photo", internal: true });
    }
    if (cost !== null) {
      await writeAudit(tx, ctx, { action: "maintenance.cost_charged_to_owner", entityType: "maintenance_request", entityId: r.id, after: { costBaisa: cost }, elevated: true });
    }
    await tellTenant(tx, ctx, r, "maintenance_completed");
    return r;
  });
}

/**
 * Add or change the office's repair cost on a completed request. The technician can add a cost that was left empty;
 * only a manager can change an existing one, and always with a reason. Clearing it (tenant pays) is also a manager action.
 */
export async function setCost(db: DB, ctx: Ctx, requestId: string, costBaisa: number | null, reason?: string) {
  const r = await load(db, ctx, requestId);
  if (r.status !== "completed") throw new DomainError("invalid_transition", { machine: "maintenance", from: r.status, to: "completed" });
  const isManager = role(ctx) === "manager";
  if (!isManager) assertCan(role(ctx), "maintenance:work");
  if (costBaisa !== null && (!Number.isSafeInteger(costBaisa) || costBaisa < 0)) throw new DomainError("invalid_amount", {}, "cost");
  if (r.costBaisa !== null && !isManager) throw new DomainError("forbidden");
  if (r.costBaisa !== null && (reason ?? "").trim().length < 3) throw new DomainError("reason_required", {}, "reason");
  await db
    .update(maintenanceRequests)
    .set({ costBaisa, costLoggedAt: costBaisa === null ? null : new Date(), postedAt: costBaisa === null ? null : new Date(), updatedAt: new Date() })
    .where(eq(maintenanceRequests.id, r.id));
  await writeAudit(db, ctx, {
    action: "maintenance.cost_changed",
    entityType: "maintenance_request",
    entityId: r.id,
    before: { costBaisa: r.costBaisa },
    after: { costBaisa },
    meta: { reason: reason ?? null },
    elevated: true,
  });
  await logEvent(db, ctx, r.id, "completed", reason ? `Cost updated: ${reason}` : "Cost recorded", true);
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


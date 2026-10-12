import { and, eq, ilike, isNull, or, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { buildings, owners, receiptCounters, units } from "@/db/schema";
import { writeAudit, diff } from "./audit";
import type { Ctx } from "./context";
import { DomainError, NotFoundError } from "./errors";
import { assertCan, type Role } from "./permissions";
import { machineActor } from "./context";
import { assertTransition, unitMachine, type UnitStatus } from "./machines";

const role = (ctx: Ctx) => ctx.actor.role as Role;

/* --------------------------------- Owners --------------------------------- */

export interface OwnerInput {
  nameEn: string;
  nameAr?: string | null;
  phone?: string | null;
  email?: string | null;
  commissionBp: number;
  payoutFrequency: "monthly" | "quarterly" | "semi_annual" | "annual" | "other";
  receiptPrefix: string;
  rentIncreaseCapBp?: number | null;
  notes?: string | null;
}

export async function createOwner(q: DB, ctx: Ctx, input: OwnerInput) {
  assertCan(role(ctx), "owners:manage");
  const prefix = input.receiptPrefix.trim().toUpperCase();
  // The receipt series must be unambiguous inside the organisation.
  const clash = await q
    .select({ id: owners.id })
    .from(owners)
    .where(and(eq(owners.orgId, ctx.orgId), eq(owners.receiptPrefix, prefix)));
  if (clash.length > 0) throw new DomainError("receipt_prefix_taken", { prefix }, "receiptPrefix");
  const [row] = await q
    .insert(owners)
    .values({ ...input, receiptPrefix: prefix, orgId: ctx.orgId })
    .returning();
  await q.insert(receiptCounters).values({ ownerId: row.id, orgId: ctx.orgId, lastNumber: 0 });
  await writeAudit(q, ctx, { action: "owner.created", entityType: "owner", entityId: row.id, after: row });
  return row;
}

export async function updateOwner(q: DB, ctx: Ctx, ownerId: string, input: Partial<OwnerInput>) {
  assertCan(role(ctx), "owners:manage");
  const [before] = await q.select().from(owners).where(and(eq(owners.id, ownerId), eq(owners.orgId, ctx.orgId)));
  if (!before) throw new NotFoundError("owner");
  const patch = { ...input };
  if (patch.receiptPrefix) {
    patch.receiptPrefix = patch.receiptPrefix.trim().toUpperCase();
    if (patch.receiptPrefix !== before.receiptPrefix) {
      // Changing the prefix is only safe before the first receipt exists, otherwise the series would be broken.
      const [counter] = await q.select().from(receiptCounters).where(eq(receiptCounters.ownerId, ownerId));
      if (counter && counter.lastNumber > 0) throw new DomainError("receipt_prefix_locked", {}, "receiptPrefix");
      const clash = await q
        .select({ id: owners.id })
        .from(owners)
        .where(and(eq(owners.orgId, ctx.orgId), eq(owners.receiptPrefix, patch.receiptPrefix)));
      if (clash.length > 0) throw new DomainError("receipt_prefix_taken", { prefix: patch.receiptPrefix }, "receiptPrefix");
    }
  }
  const [after] = await q.update(owners).set(patch).where(and(eq(owners.id, ownerId), eq(owners.orgId, ctx.orgId))).returning();
  const d = diff(before, patch as never);
  const money = "commissionBp" in d.after || "payoutFrequency" in d.after || "rentIncreaseCapBp" in d.after;
  await writeAudit(q, ctx, {
    action: money ? "owner.terms_changed" : "owner.updated",
    entityType: "owner",
    entityId: ownerId,
    ...d,
    elevated: money,
  });
  return after;
}

export async function archiveOwner(q: DB, ctx: Ctx, ownerId: string) {
  assertCan(role(ctx), "owners:manage");
  await ownerInOrg(q, ctx, ownerId);
  const live = await q
    .select({ id: buildings.id })
    .from(buildings)
    .where(and(eq(buildings.ownerId, ownerId), eq(buildings.orgId, ctx.orgId), isNull(buildings.archivedAt)));
  if (live.length > 0) throw new DomainError("owner_has_buildings");
  await q.update(owners).set({ archivedAt: new Date() }).where(and(eq(owners.id, ownerId), eq(owners.orgId, ctx.orgId)));
  await writeAudit(q, ctx, { action: "owner.archived", entityType: "owner", entityId: ownerId });
}

/* ------------------------------- Buildings -------------------------------- */

export interface BuildingInput {
  ownerId: string;
  nameEn: string;
  nameAr?: string | null;
  area?: string | null;
  address?: string | null;
  notes?: string | null;
}

async function ownerInOrg(q: DB, ctx: Ctx, ownerId: string) {
  const [o] = await q.select().from(owners).where(and(eq(owners.id, ownerId), eq(owners.orgId, ctx.orgId)));
  if (!o) throw new NotFoundError("owner");
  return o;
}

export async function createBuilding(q: DB, ctx: Ctx, input: BuildingInput) {
  assertCan(role(ctx), "buildings:manage");
  await ownerInOrg(q, ctx, input.ownerId);
  const [row] = await q.insert(buildings).values({ ...input, orgId: ctx.orgId }).returning();
  await writeAudit(q, ctx, { action: "building.created", entityType: "building", entityId: row.id, after: row });
  return row;
}

export async function updateBuilding(q: DB, ctx: Ctx, buildingId: string, input: Partial<Omit<BuildingInput, "ownerId">>) {
  assertCan(role(ctx), "buildings:manage");
  const [before] = await q.select().from(buildings).where(and(eq(buildings.id, buildingId), eq(buildings.orgId, ctx.orgId)));
  if (!before) throw new NotFoundError("building");
  const [after] = await q.update(buildings).set(input).where(eq(buildings.id, buildingId)).returning();
  await writeAudit(q, ctx, { action: "building.updated", entityType: "building", entityId: buildingId, ...diff(before, input as never) });
  return after;
}

export async function archiveBuilding(q: DB, ctx: Ctx, buildingId: string) {
  assertCan(role(ctx), "buildings:manage");
  const [b] = await q.select({ id: buildings.id }).from(buildings).where(and(eq(buildings.id, buildingId), eq(buildings.orgId, ctx.orgId)));
  if (!b) throw new NotFoundError("building");
  const live = await q
    .select({ id: units.id })
    .from(units)
    .where(and(eq(units.buildingId, buildingId), eq(units.orgId, ctx.orgId), isNull(units.archivedAt)));
  if (live.length > 0) throw new DomainError("building_has_units");
  await q.update(buildings).set({ archivedAt: new Date() }).where(and(eq(buildings.id, buildingId), eq(buildings.orgId, ctx.orgId)));
  await writeAudit(q, ctx, { action: "building.archived", entityType: "building", entityId: buildingId });
}

/* --------------------------------- Units ---------------------------------- */

export interface UnitInput {
  buildingId: string;
  label: string;
  labelAr?: string | null;
  floor?: string | null;
  type: "apartment" | "villa" | "studio" | "shop" | "office" | "warehouse";
  bedrooms?: number | null;
  commercial?: boolean;
  rentBaisa: number;
  rentIncreaseCapBp?: number | null;
}

export async function createUnit(q: DB, ctx: Ctx, input: UnitInput) {
  assertCan(role(ctx), "units:manage");
  const [b] = await q.select().from(buildings).where(and(eq(buildings.id, input.buildingId), eq(buildings.orgId, ctx.orgId)));
  if (!b) throw new NotFoundError("building");
  const dup = await q
    .select({ id: units.id })
    .from(units)
    .where(and(eq(units.buildingId, input.buildingId), eq(units.label, input.label.trim())));
  if (dup.length > 0) throw new DomainError("unit_label_taken", { label: input.label }, "label");
  const [row] = await q
    .insert(units)
    .values({
      ...input,
      label: input.label.trim(),
      commercial: input.commercial ?? ["shop", "office", "warehouse"].includes(input.type),
      orgId: ctx.orgId,
      ownerId: b.ownerId,
    })
    .returning();
  await writeAudit(q, ctx, { action: "unit.created", entityType: "unit", entityId: row.id, after: row });
  return row;
}

/** Create many units in one go from a label list, for example 101..110. Atomic: all or none. */
export async function createUnitsBulk(
  q: DB,
  ctx: Ctx,
  base: Omit<UnitInput, "label" | "labelAr">,
  labels: string[],
) {
  assertCan(role(ctx), "units:manage");
  if (labels.length === 0) throw new DomainError("no_units");
  if (labels.length > 300) throw new DomainError("too_many_units");
  const created = [];
  for (const label of labels) created.push(await createUnit(q, ctx, { ...base, label }));
  return created;
}

export async function updateUnit(q: DB, ctx: Ctx, unitId: string, input: Partial<Omit<UnitInput, "buildingId">>) {
  assertCan(role(ctx), "units:manage");
  const [before] = await q.select().from(units).where(and(eq(units.id, unitId), eq(units.orgId, ctx.orgId)));
  if (!before) throw new NotFoundError("unit");
  if (input.label && input.label.trim() !== before.label) {
    const dup = await q
      .select({ id: units.id })
      .from(units)
      .where(and(eq(units.buildingId, before.buildingId), eq(units.label, input.label.trim())));
    if (dup.length > 0) throw new DomainError("unit_label_taken", { label: input.label }, "label");
  }
  const [after] = await q.update(units).set(input).where(eq(units.id, unitId)).returning();
  const d = diff(before, input as never);
  await writeAudit(q, ctx, {
    action: "rentIncreaseCapBp" in d.after ? "unit.cap_changed" : "unit.updated",
    entityType: "unit",
    entityId: unitId,
    ...d,
  });
  return after;
}

export async function archiveUnit(q: DB, ctx: Ctx, unitId: string) {
  assertCan(role(ctx), "units:manage");
  const [u] = await q.select().from(units).where(and(eq(units.id, unitId), eq(units.orgId, ctx.orgId)));
  if (!u) throw new NotFoundError("unit");
  if (u.status !== "available") throw new DomainError("unit_not_available_to_archive");
  await q.update(units).set({ archivedAt: new Date() }).where(eq(units.id, unitId));
  await writeAudit(q, ctx, { action: "unit.archived", entityType: "unit", entityId: unitId });
}

/**
 * The only way a unit changes status. Validates the transition against the unit state machine
 * and the actor's role, then audits it. Invalid transitions are rejected by the system, not the UI.
 */
export async function transitionUnit(
  q: DB,
  ctx: Ctx,
  unitId: string,
  to: UnitStatus,
  opts: { note?: string; skipRoleCheck?: boolean } = {},
) {
  const [unit] = await q.select().from(units).where(and(eq(units.id, unitId), eq(units.orgId, ctx.orgId)));
  if (!unit) throw new NotFoundError("unit");
  const from = unit.status as UnitStatus;
  assertTransition(unitMachine, from, to, machineActor(ctx));

  if (to === "available" && from === "inspected") {
    // Defence in depth: the machine already forces inspected -> available, but the inspection record must say so too.
    const { inspections } = await import("@/db/schema");
    const latest = await q
      .select()
      .from(inspections)
      .where(and(eq(inspections.unitId, unitId), eq(inspections.orgId, ctx.orgId)))
      .orderBy(sql`${inspections.createdAt} desc`)
      .limit(1);
    if (latest[0] && latest[0].status !== "inspected" && latest[0].status !== "approved") {
      throw new DomainError("inspection_incomplete");
    }
  }

  const [after] = await q
    .update(units)
    .set({ status: to, statusSince: new Date() })
    .where(and(eq(units.id, unitId), eq(units.status, from)))
    .returning();
  if (!after) throw new DomainError("concurrent_change");
  await writeAudit(q, ctx, {
    action: "unit.status_changed",
    entityType: "unit",
    entityId: unitId,
    before: { status: from },
    after: { status: to },
    meta: opts.note ? { note: opts.note } : undefined,
  });
  return after;
}

/** Why can this unit not simply become available? Used to explain the "under inspection" block to the manager. */
export function whyNotAvailable(status: UnitStatus): string | null {
  switch (status) {
    case "under_inspection":
      return "blocked.under_inspection";
    case "inspected":
      return "blocked.awaiting_approval";
    case "vacated":
      return "blocked.vacated";
    case "notice_given":
      return "blocked.notice";
    case "occupied":
      return "blocked.occupied";
    case "reserved":
      return "blocked.reserved";
    default:
      return null;
  }
}

/* --------------------------- Read helpers (lists) --------------------------- */

export interface Page<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const PAGE_SIZE = 20;

export function likeAny(value: string) {
  return `%${value.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
}

export async function searchOwners(q: DB, orgId: string, search?: string, includeArchived = false) {
  const conds = [eq(owners.orgId, orgId)];
  if (!includeArchived) conds.push(isNull(owners.archivedAt));
  if (search) conds.push(or(ilike(owners.nameEn, likeAny(search)), ilike(owners.nameAr, likeAny(search)))!);
  return q.select().from(owners).where(and(...conds)).orderBy(owners.nameEn);
}


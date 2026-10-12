"use server";

import { z } from "zod";
import { getDb } from "@/db/client";
import { archiveBuilding, archiveOwner, archiveUnit, createBuilding, createOwner, createUnit, createUnitsBulk, transitionUnit, updateBuilding, updateOwner, updateUnit } from "@/domain/portfolio";
import { createTenant, sendTenantWelcome, updateTenant, archiveTenant } from "@/domain/tenants";
import { parseForm, staffAction } from "@/lib/action";
import { getBaseUrl } from "@/lib/session";
import { parseOMR, parsePercentToBp } from "@/lib/money";
import { saveFile } from "@/lib/storage";
import { DomainError } from "@/domain/errors";
import type { Ctx } from "@/domain/context";
import type { UnitStatus } from "@/domain/machines";

const uuid = z.string().uuid("err.not_found");
const opt = z.string().optional().transform((v) => (v && v.trim() ? v.trim() : null));
const pct = (required: boolean) =>
  z.string().optional().transform((v, c) => {
    if (!v || !v.trim()) {
      if (required) c.addIssue({ code: "custom", message: "err.invalid_percent" });
      return null;
    }
    const bp = parsePercentToBp(v);
    if (bp === null) {
      c.addIssue({ code: "custom", message: "err.invalid_percent" });
      return z.NEVER;
    }
    return bp;
  });
const money = z.string().transform((v, c) => {
  const n = parseOMR(v);
  if (n === null || n < 0) {
    c.addIssue({ code: "custom", message: "err.invalid_amount" });
    return z.NEVER;
  }
  return n;
});
const freq = z.enum(["monthly", "quarterly", "semi_annual", "annual", "other"]);

const ownerSchema = z.object({
  nameEn: z.string().min(2, "err.name_required"),
  nameAr: opt,
  phone: opt,
  email: opt,
  commissionPercent: pct(true),
  payoutFrequency: freq,
  receiptPrefix: z.string().min(1, "err.invalid_prefix").max(8, "err.invalid_prefix").regex(/^[A-Za-z0-9]+$/, "err.invalid_prefix"),
  capPercent: pct(false),
  notes: opt,
});

export const createOwnerAction = staffAction("owners:manage", async ({ c, form, t }) => {
  const v = parseForm(ownerSchema, form, t);
  const o = await createOwner(c.db, c.ctx, { nameEn: v.nameEn, nameAr: v.nameAr, phone: v.phone, email: v.email, commissionBp: v.commissionPercent ?? 0, payoutFrequency: v.payoutFrequency, receiptPrefix: v.receiptPrefix, rentIncreaseCapBp: v.capPercent, notes: v.notes });
  return { message: "msg.owner_created", redirectTo: `/owners/${o.id}` };
});

export const updateOwnerAction = staffAction("owners:manage", async ({ c, form, t }) => {
  const v = parseForm(ownerSchema.extend({ id: uuid }), form, t);
  await updateOwner(c.db, c.ctx, v.id, { nameEn: v.nameEn, nameAr: v.nameAr, phone: v.phone, email: v.email, commissionBp: v.commissionPercent ?? 0, payoutFrequency: v.payoutFrequency, receiptPrefix: v.receiptPrefix, rentIncreaseCapBp: v.capPercent, notes: v.notes });
  return { message: "msg.saved", revalidate: [`/owners/${v.id}`, "/owners"] };
});

export const archiveOwnerAction = staffAction("owners:manage", async ({ c, form, t }) => {
  await archiveOwner(c.db, c.ctx, parseForm(z.object({ id: uuid }), form, t).id);
  return { message: "msg.archived", redirectTo: "/owners" };
});

const buildingSchema = z.object({ ownerId: uuid, nameEn: z.string().min(2, "err.name_required"), nameAr: opt, area: opt, address: opt, notes: opt });

export const createBuildingAction = staffAction("buildings:manage", async ({ c, form, t }) => {
  const v = parseForm(buildingSchema, form, t);
  const b = await createBuilding(c.db, c.ctx, v);
  return { message: "msg.building_created", redirectTo: `/buildings/${b.id}` };
});

export const updateBuildingAction = staffAction("buildings:manage", async ({ c, form, t }) => {
  const v = parseForm(buildingSchema.extend({ id: uuid }).omit({ ownerId: true }), form, t);
  await updateBuilding(c.db, c.ctx, v.id, { nameEn: v.nameEn, nameAr: v.nameAr, area: v.area, address: v.address, notes: v.notes });
  return { message: "msg.saved", revalidate: [`/buildings/${v.id}`] };
});

export const archiveBuildingAction = staffAction("buildings:manage", async ({ c, form, t }) => {
  await archiveBuilding(c.db, c.ctx, parseForm(z.object({ id: uuid }), form, t).id);
  return { message: "msg.archived", redirectTo: "/buildings" };
});

const unitType = z.enum(["apartment", "villa", "studio", "shop", "office", "warehouse"]);

export const createUnitAction = staffAction("units:manage", async ({ c, form, t }) => {
  const v = parseForm(z.object({ buildingId: uuid, label: z.string().min(1, "err.name_required"), type: unitType, bedrooms: opt, floor: opt, rent: money, capPercent: pct(false) }), form, t);
  const u = await createUnit(c.db, c.ctx, { buildingId: v.buildingId, label: v.label, type: v.type, bedrooms: v.bedrooms ? Number(v.bedrooms) : null, floor: v.floor, rentBaisa: v.rent, rentIncreaseCapBp: v.capPercent });
  return { message: "msg.unit_created", revalidate: [`/buildings/${v.buildingId}`, "/units"], data: { id: u.id } };
});

/** Add many units at once: a prefix, a number range and one rent, for example A-101 to A-110. */
export const createUnitsRangeAction = staffAction("units:manage", async ({ c, form, t }) => {
  const v = parseForm(z.object({ buildingId: uuid, prefix: z.string().optional(), from: z.coerce.number().int().min(0, "err.invalid_number"), to: z.coerce.number().int().min(0, "err.invalid_number"), type: unitType, bedrooms: opt, rent: money }), form, t);
  if (v.to < v.from) throw new DomainError("invalid_number", {}, "to");
  const labels: string[] = [];
  for (let n = v.from; n <= v.to; n++) labels.push(`${v.prefix ?? ""}${n}`);
  await createUnitsBulk(c.db, c.ctx, { buildingId: v.buildingId, type: v.type, bedrooms: v.bedrooms ? Number(v.bedrooms) : null, rentBaisa: v.rent }, labels);
  return { message: "msg.units_created", revalidate: [`/buildings/${v.buildingId}`, "/units"] };
});

export const updateUnitAction = staffAction("units:manage", async ({ c, form, t }) => {
  const v = parseForm(z.object({ id: uuid, label: z.string().min(1, "err.name_required"), type: unitType, bedrooms: opt, floor: opt, rent: money, capPercent: pct(false) }), form, t);
  await updateUnit(c.db, c.ctx, v.id, { label: v.label, type: v.type, bedrooms: v.bedrooms ? Number(v.bedrooms) : null, floor: v.floor, rentBaisa: v.rent, rentIncreaseCapBp: v.capPercent });
  return { message: "msg.saved", revalidate: [`/units/${v.id}`, "/units"] };
});

export const archiveUnitAction = staffAction("units:manage", async ({ c, form, t }) => {
  await archiveUnit(c.db, c.ctx, parseForm(z.object({ id: uuid }), form, t).id);
  return { message: "msg.archived", redirectTo: "/units" };
});

export const transitionUnitAction = staffAction("units:transition", async ({ c, form, t }) => {
  const v = parseForm(z.object({ id: uuid, to: z.string(), note: z.string().optional() }), form, t);
  await transitionUnit(c.db, c.ctx, v.id, v.to as UnitStatus, { note: v.note });
  return { message: "msg.unit_updated", revalidate: [`/units/${v.id}`, "/units", "/dashboard"] };
});

const tenantSchema = z.object({
  nameEn: z.string().min(2, "err.name_required"),
  nameAr: opt,
  phone: z.string().min(6, "err.invalid_phone"),
  email: opt,
  idNumber: z.string().min(5, "err.invalid_id_number"),
  locale: z.enum(["en", "ar"]),
  internalNotes: opt,
});

async function maybeIdDoc(form: FormData, ctx: Ctx): Promise<string | null> {
  const f = form.get("idDoc");
  if (!f || typeof f === "string" || f.size === 0) return null;
  const db = await getDb();
  return saveFile(db, { orgId: ctx.orgId, name: f.name, data: Buffer.from(await f.arrayBuffer()), category: "id_doc", createdBy: ctx.actor.id });
}

export const createTenantAction = staffAction("tenants:manage", async ({ c, form, t }) => {
  const v = parseForm(tenantSchema.extend({ consent: z.string().optional() }), form, t);
  const idDocFileId = await maybeIdDoc(form, c.ctx);
  const tenant = await createTenant(c.db, c.ctx, { ...v, consent: !!v.consent, idDocFileId });
  await sendTenantWelcome(c.db, c.ctx, tenant.id, await getBaseUrl());
  const next = String(form.get("next") ?? "");
  return { message: "msg.tenant_created", redirectTo: next.startsWith("/") && !next.startsWith("//") ? `${next}${next.includes("?") ? "&" : "?"}tenant=${tenant.id}` : `/tenants/${tenant.id}` };
});

export const updateTenantAction = staffAction("tenants:manage", async ({ c, form, t }) => {
  const v = parseForm(tenantSchema.omit({ idNumber: true }).extend({ id: uuid }), form, t);
  const idDocFileId = await maybeIdDoc(form, c.ctx);
  await updateTenant(c.db, c.ctx, v.id, { ...v, ...(idDocFileId ? { idDocFileId } : {}) });
  return { message: "msg.saved", revalidate: [`/tenants/${v.id}`] };
});

export const resendWelcomeAction = staffAction("tenants:manage", async ({ c, form, t }) => {
  const { id } = parseForm(z.object({ id: uuid }), form, t);
  await sendTenantWelcome(c.db, c.ctx, id, await getBaseUrl());
  return { message: "msg.welcome_sent", revalidate: [`/tenants/${id}`, "/notifications"] };
});

export const archiveTenantAction = staffAction("tenants:manage", async ({ c, form, t }) => {
  await archiveTenant(c.db, c.ctx, parseForm(z.object({ id: uuid }), form, t).id);
  return { message: "msg.archived", redirectTo: "/tenants" };
});

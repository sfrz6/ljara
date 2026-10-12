import { and, eq, ne, or } from "drizzle-orm";
import type { DB } from "@/db/client";
import { organisations, tenants } from "@/db/schema";
import { addMonths, todayISO } from "@/lib/dates";
import { normalisePhone } from "@/lib/phone";
import { diff, writeAudit } from "./audit";
import type { Ctx } from "./context";
import { DomainError, NotFoundError } from "./errors";
import { notifyTenant } from "./notifications";
import { assertCan, type Role } from "./permissions";

const role = (ctx: Ctx) => ctx.actor.role as Role;

export interface TenantInput {
  nameEn: string;
  nameAr?: string | null;
  phone: string;
  email?: string | null;
  idNumber: string;
  locale: "en" | "ar";
  idDocFileId?: string | null;
  internalNotes?: string | null;
  consent: boolean;
}

/** Duplicate detection on normalised phone and ID number (CR-12.4, M-05). */
export async function findDuplicateTenant(q: DB, orgId: string, phoneE164: string, idNumber: string, excludeId?: string) {
  const conds = [eq(tenants.orgId, orgId), or(eq(tenants.phone, phoneE164), eq(tenants.idNumber, idNumber.trim()))!];
  if (excludeId) conds.push(ne(tenants.id, excludeId));
  const rows = await q.select().from(tenants).where(and(...conds));
  return rows[0] ?? null;
}

export async function createTenant(q: DB, ctx: Ctx, input: TenantInput) {
  assertCan(role(ctx), "tenants:manage");
  const phone = normalisePhone(input.phone);
  if (!phone) throw new DomainError("invalid_phone", {}, "phone");
  const idNumber = input.idNumber.trim();
  if (!/^[A-Za-z0-9-]{5,20}$/.test(idNumber)) throw new DomainError("invalid_id_number", {}, "idNumber");
  const dup = await findDuplicateTenant(q, ctx.orgId, phone, idNumber);
  if (dup) {
    throw new DomainError(dup.idNumber === idNumber ? "duplicate_tenant_id" : "duplicate_tenant_phone", { name: dup.nameEn, id: dup.id }, dup.idNumber === idNumber ? "idNumber" : "phone");
  }
  if (!input.consent) throw new DomainError("consent_required", {}, "consent");
  const [row] = await q
    .insert(tenants)
    .values({
      orgId: ctx.orgId,
      nameEn: input.nameEn.trim(),
      nameAr: input.nameAr?.trim() || null,
      phone,
      email: input.email?.trim().toLowerCase() || null,
      idNumber,
      locale: input.locale,
      idDocFileId: input.idDocFileId ?? null,
      internalNotes: input.internalNotes ?? null,
      consentAt: new Date(),
    })
    .returning();
  await writeAudit(q, ctx, { action: "tenant.created", entityType: "tenant", entityId: row.id, after: row });
  return row;
}

/** Tell the tenant their account is ready. They activate with ID number + OTP (CR-5.2). */
export async function sendTenantWelcome(q: DB, ctx: Ctx, tenantId: string, baseUrl: string) {
  const [t] = await q.select().from(tenants).where(and(eq(tenants.id, tenantId), eq(tenants.orgId, ctx.orgId)));
  if (!t) throw new NotFoundError("tenant");
  const [org] = await q.select().from(organisations).where(eq(organisations.id, ctx.orgId));
  return notifyTenant(q, {
    orgId: ctx.orgId,
    tenantId,
    template: "tenant_welcome",
    vars: {
      name: t.locale === "ar" ? (t.nameAr ?? t.nameEn) : t.nameEn,
      org: t.locale === "ar" ? (org.nameAr ?? org.name) : org.name,
      link: `${baseUrl}/portal/activate`,
    },
    idempotencyKey: `welcome:${tenantId}:${Date.now()}`,
    link: "/portal/activate",
  });
}

export async function updateTenant(q: DB, ctx: Ctx, tenantId: string, input: Partial<TenantInput>) {
  assertCan(role(ctx), "tenants:manage");
  const [before] = await q.select().from(tenants).where(and(eq(tenants.id, tenantId), eq(tenants.orgId, ctx.orgId)));
  if (!before) throw new NotFoundError("tenant");
  const patch: Partial<typeof before> = {};
  if (input.nameEn !== undefined) patch.nameEn = input.nameEn.trim();
  if (input.nameAr !== undefined) patch.nameAr = input.nameAr?.trim() || null;
  if (input.email !== undefined) patch.email = input.email?.trim().toLowerCase() || null;
  if (input.locale) patch.locale = input.locale;
  if (input.internalNotes !== undefined) patch.internalNotes = input.internalNotes;
  if (input.idDocFileId !== undefined) patch.idDocFileId = input.idDocFileId;
  if (input.phone) {
    const phone = normalisePhone(input.phone);
    if (!phone) throw new DomainError("invalid_phone", {}, "phone");
    const dup = await findDuplicateTenant(q, ctx.orgId, phone, before.idNumber, tenantId);
    if (dup) throw new DomainError("duplicate_tenant_phone", { name: dup.nameEn, id: dup.id }, "phone");
    patch.phone = phone;
  }
  const [after] = await q.update(tenants).set(patch).where(eq(tenants.id, tenantId)).returning();
  await writeAudit(q, ctx, { action: "tenant.updated", entityType: "tenant", entityId: tenantId, ...diff(before, patch) });
  return after;
}

/** Former tenants keep read-only portal access for 12 months, then it is archived (G4). */
export async function markTenantFormer(q: DB, ctx: Ctx, tenantId: string) {
  await q
    .update(tenants)
    .set({ status: "former", portalAccessUntil: addMonths(todayISO(), 12) })
    .where(and(eq(tenants.id, tenantId), eq(tenants.orgId, ctx.orgId)));
  await writeAudit(q, ctx, { action: "tenant.became_former", entityType: "tenant", entityId: tenantId });
}

export async function reactivateTenant(q: DB, ctx: Ctx, tenantId: string) {
  await q
    .update(tenants)
    .set({ status: "active", portalAccessUntil: null })
    .where(and(eq(tenants.id, tenantId), eq(tenants.orgId, ctx.orgId)));
}

export async function archiveTenant(q: DB, ctx: Ctx, tenantId: string) {
  assertCan(role(ctx), "tenants:manage");
  const [t] = await q.select({ id: tenants.id }).from(tenants).where(and(eq(tenants.id, tenantId), eq(tenants.orgId, ctx.orgId)));
  if (!t) throw new NotFoundError("tenant");
  await q.update(tenants).set({ status: "archived" }).where(and(eq(tenants.id, tenantId), eq(tenants.orgId, ctx.orgId)));
  await writeAudit(q, ctx, { action: "tenant.archived", entityType: "tenant", entityId: tenantId });
}

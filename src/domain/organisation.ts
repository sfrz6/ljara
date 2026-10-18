import { and, asc, eq, ne } from "drizzle-orm";
import type { DB } from "@/db/client";
import {
  defaultNotificationPrefs,
  maintenanceCategories,
  messageTemplates,
  organisations,
  users,
  type NotificationPrefs,
} from "@/db/schema";
import { normalisePhone } from "@/lib/phone";
import { hashPassword, validatePasswordStrength } from "@/lib/password";
import { diff, writeAudit } from "./audit";
import type { Ctx } from "./context";
import { DomainError, NotFoundError } from "./errors";
import { assertCan, STAFF_ROLES, type Role } from "./permissions";
import { revokeAllSessions } from "./auth";
import { gatewayAvailable } from "@/lib/features";

const role = (ctx: Ctx) => ctx.actor.role as Role;

export const DEFAULT_CATEGORIES = [
  { key: "ac", nameEn: "Air conditioning", nameAr: "تكييف" },
  { key: "plumbing", nameEn: "Plumbing", nameAr: "سباكة" },
  { key: "electrical", nameEn: "Electrical", nameAr: "كهرباء" },
  { key: "carpentry", nameEn: "Carpentry", nameAr: "نجارة" },
  { key: "civil", nameEn: "Civil works", nameAr: "أعمال مدنية" },
  { key: "painting", nameEn: "Painting", nameAr: "دهان" },
  { key: "other", nameEn: "Other", nameAr: "أخرى" },
];

export async function seedCategories(q: DB, orgId: string) {
  await q
    .insert(maintenanceCategories)
    .values(DEFAULT_CATEGORIES.map((c, i) => ({ ...c, orgId, sortOrder: i })))
    .onConflictDoNothing();
}

/* --------------------------------- Signup --------------------------------- */

export interface SignupInput {
  orgName: string;
  orgNameAr?: string | null;
  adminName: string;
  email: string;
  phone: string;
  password: string;
  locale: "en" | "ar";
}

/** Public signup: creates the organisation, its first Manager / Admin and the default configuration. */
export async function signupOrganisation(db: DB, input: SignupInput) {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new DomainError("invalid_email", {}, "email");
  const phone = normalisePhone(input.phone);
  if (!phone) throw new DomainError("invalid_phone", {}, "phone");
  const weak = validatePasswordStrength(input.password);
  if (weak) throw new DomainError(weak, {}, "password");
  if (input.orgName.trim().length < 2) throw new DomainError("name_required", {}, "orgName");
  if (input.adminName.trim().length < 2) throw new DomainError("name_required", {}, "adminName");
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existing) throw new DomainError("email_taken", {}, "email");

  const passwordHash = await hashPassword(input.password);
  return db.transaction(async (tx0) => {
    const tx = tx0 as unknown as DB;
    const [org] = await tx
      .insert(organisations)
      .values({
        name: input.orgName.trim(),
        nameAr: input.orgNameAr?.trim() || null,
        defaultLocale: input.locale,
        phone,
        email,
        notificationPrefs: defaultNotificationPrefs,
        onlinePaymentsEnabled: gatewayAvailable(),
      })
      .returning();
    const [user] = await tx
      .insert(users)
      .values({ orgId: org.id, email, name: input.adminName.trim(), phone, role: "manager", passwordHash, locale: input.locale })
      .returning();
    await seedCategories(tx, org.id);
    await writeAudit(tx, { orgId: org.id, actor: { kind: "user", id: user.id, name: user.name, role: "manager" } }, {
      action: "organisation.created",
      entityType: "organisation",
      entityId: org.id,
      after: { name: org.name },
    });
    return { org, user };
  });
}

/* ------------------------------- Org settings ------------------------------- */

export interface OrgSettingsInput {
  name?: string;
  nameAr?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  crNumber?: string | null;
  defaultLocale?: "en" | "ar";
  logoFileId?: string | null;
  defaultCommissionBp?: number;
  defaultPayoutFrequency?: "monthly" | "quarterly" | "semi_annual" | "annual" | "other";
  receiptPrefix?: string;
  rentIncreaseCapBp?: number | null;
  contractAlertDays?: number;
  tenantScheduleVisible?: boolean;
  onlinePaymentsEnabled?: boolean;
  gatewayFeeBp?: number;
  gatewayFeeMode?: "office_absorbs" | "owner_net" | "owner_line";
  vatEnabled?: boolean;
  vatBp?: number;
  notificationPrefs?: NotificationPrefs;
}

const FINANCIAL_KEYS = ["defaultCommissionBp", "gatewayFeeBp", "gatewayFeeMode", "vatEnabled", "vatBp", "rentIncreaseCapBp", "onlinePaymentsEnabled"];

export async function updateOrgSettings(db: DB, ctx: Ctx, input: OrgSettingsInput) {
  assertCan(role(ctx), "settings:manage");
  const [before] = await db.select().from(organisations).where(eq(organisations.id, ctx.orgId));
  if (!before) throw new NotFoundError("organisation");
  const patch = { ...input };
  if (patch.contractAlertDays !== undefined && (patch.contractAlertDays < 1 || patch.contractAlertDays > 365)) {
    throw new DomainError("invalid_number", {}, "contractAlertDays");
  }
  const [after] = await db.update(organisations).set(patch).where(eq(organisations.id, ctx.orgId)).returning();
  const d = diff(before, patch as never);
  const financial = Object.keys(d.after).some((k) => FINANCIAL_KEYS.includes(k));
  await writeAudit(db, ctx, {
    action: financial ? "settings.financial_changed" : "settings.updated",
    entityType: "organisation",
    entityId: ctx.orgId,
    before: d.before,
    after: d.after,
    elevated: financial,
  });
  return after;
}

export async function completeOnboarding(db: DB, ctx: Ctx) {
  await db.update(organisations).set({ onboardingCompletedAt: new Date() }).where(eq(organisations.id, ctx.orgId));
}

/* ------------------------------- Categories ------------------------------- */

export async function listCategories(q: DB, orgId: string, includeInactive = false) {
  const rows = await q
    .select()
    .from(maintenanceCategories)
    .where(eq(maintenanceCategories.orgId, orgId))
    .orderBy(asc(maintenanceCategories.sortOrder), asc(maintenanceCategories.nameEn));
  return includeInactive ? rows : rows.filter((r) => r.active);
}

export async function upsertCategory(db: DB, ctx: Ctx, input: { id?: string; nameEn: string; nameAr?: string | null; active?: boolean }) {
  assertCan(role(ctx), "settings:manage");
  const nameEn = input.nameEn.trim();
  if (nameEn.length < 2) throw new DomainError("name_required", {}, "nameEn");
  if (input.id) {
    await db
      .update(maintenanceCategories)
      .set({ nameEn, nameAr: input.nameAr?.trim() || null, active: input.active ?? true })
      .where(and(eq(maintenanceCategories.id, input.id), eq(maintenanceCategories.orgId, ctx.orgId)));
    await writeAudit(db, ctx, { action: "category.updated", entityType: "maintenance_category", entityId: input.id, after: input });
    return;
  }
  const key = nameEn.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || `cat_${Date.now()}`;
  const [row] = await db
    .insert(maintenanceCategories)
    .values({ orgId: ctx.orgId, key, nameEn, nameAr: input.nameAr?.trim() || null, sortOrder: 100 })
    .onConflictDoNothing()
    .returning();
  if (!row) throw new DomainError("category_exists", {}, "nameEn");
  await writeAudit(db, ctx, { action: "category.created", entityType: "maintenance_category", entityId: row.id, after: row });
}

/* ---------------------------------- Staff ---------------------------------- */

export async function listStaff(q: DB, orgId: string) {
  return q
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      role: users.role,
      active: users.active,
      locale: users.locale,
      lastLoginAt: users.lastLoginAt,
      twoFactorEnabled: users.twoFactorEnabled,
    })
    .from(users)
    .where(eq(users.orgId, orgId))
    .orderBy(asc(users.name));
}

export async function inviteStaff(
  db: DB,
  ctx: Ctx,
  input: { name: string; email: string; phone?: string | null; role: Role; password: string; locale: "en" | "ar" },
) {
  assertCan(role(ctx), "users:manage");
  if (!STAFF_ROLES.includes(input.role)) throw new DomainError("invalid_role", {}, "role");
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new DomainError("invalid_email", {}, "email");
  const weak = validatePasswordStrength(input.password);
  if (weak) throw new DomainError(weak, {}, "password");
  const phone = input.phone ? normalisePhone(input.phone) : null;
  if (input.phone && !phone) throw new DomainError("invalid_phone", {}, "phone");
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existing) throw new DomainError("email_taken", {}, "email");
  const [row] = await db
    .insert(users)
    .values({ orgId: ctx.orgId, email, name: input.name.trim(), phone, role: input.role, passwordHash: await hashPassword(input.password), locale: input.locale })
    .returning();
  await writeAudit(db, ctx, { action: "user.created", entityType: "user", entityId: row.id, after: { email, role: input.role, name: row.name }, elevated: true });
  return row;
}

export async function changeStaffRole(db: DB, ctx: Ctx, userId: string, newRole: Role) {
  assertCan(role(ctx), "users:manage");
  if (!STAFF_ROLES.includes(newRole)) throw new DomainError("invalid_role");
  const [u] = await db.select().from(users).where(and(eq(users.id, userId), eq(users.orgId, ctx.orgId)));
  if (!u) throw new NotFoundError("user");
  if (u.role === "manager" && newRole !== "manager") await assertAnotherManager(db, ctx.orgId, u.id);
  await db.update(users).set({ role: newRole }).where(eq(users.id, u.id));
  await revokeAllSessions(db, u.id);
  await writeAudit(db, ctx, { action: "role.changed", entityType: "user", entityId: u.id, before: { role: u.role }, after: { role: newRole } });
}

export async function setStaffActive(db: DB, ctx: Ctx, userId: string, active: boolean) {
  assertCan(role(ctx), "users:manage");
  const [u] = await db.select().from(users).where(and(eq(users.id, userId), eq(users.orgId, ctx.orgId)));
  if (!u) throw new NotFoundError("user");
  if (!active && u.role === "manager") await assertAnotherManager(db, ctx.orgId, u.id);
  if (!active && u.id === ctx.actor.id) throw new DomainError("cannot_deactivate_self");
  await db.update(users).set({ active }).where(eq(users.id, u.id));
  if (!active) await revokeAllSessions(db, u.id);
  await writeAudit(db, ctx, { action: active ? "user.activated" : "user.deactivated", entityType: "user", entityId: u.id, elevated: true });
}

async function assertAnotherManager(db: DB, orgId: string, exceptId: string) {
  const others = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.orgId, orgId), eq(users.role, "manager"), eq(users.active, true), ne(users.id, exceptId)));
  if (others.length === 0) throw new DomainError("last_manager");
}

export async function forceSignOut(db: DB, ctx: Ctx, userId: string) {
  assertCan(role(ctx), "users:manage");
  const [u] = await db.select({ id: users.id }).from(users).where(and(eq(users.id, userId), eq(users.orgId, ctx.orgId)));
  if (!u) throw new NotFoundError("user");
  await revokeAllSessions(db, userId);
  await writeAudit(db, ctx, { action: "user.forced_sign_out", entityType: "user", entityId: userId, elevated: true });
}

/* ------------------------------ Message templates ------------------------------ */

export async function saveTemplate(db: DB, ctx: Ctx, input: { key: string; locale: "en" | "ar"; body: string }) {
  assertCan(role(ctx), "settings:manage");
  const body = input.body.trim();
  if (body.length < 5) throw new DomainError("body_required", {}, "body");
  await db
    .insert(messageTemplates)
    .values({ orgId: ctx.orgId, key: input.key, locale: input.locale, body })
    .onConflictDoUpdate({
      target: [messageTemplates.orgId, messageTemplates.key, messageTemplates.locale],
      set: { body, updatedAt: new Date() },
    });
  await writeAudit(db, ctx, { action: "template.updated", entityType: "message_template", entityId: input.key, after: { locale: input.locale, body } });
}

export async function resetTemplate(db: DB, ctx: Ctx, key: string, locale: "en" | "ar") {
  assertCan(role(ctx), "settings:manage");
  await db
    .delete(messageTemplates)
    .where(and(eq(messageTemplates.orgId, ctx.orgId), eq(messageTemplates.key, key), eq(messageTemplates.locale, locale)));
  await writeAudit(db, ctx, { action: "template.reset", entityType: "message_template", entityId: key, after: { locale } });
}

/** A manager sets a new starting password for a colleague (for example after they forgot theirs). Signs them out everywhere. */
export async function resetStaffPasswordByManager(db: DB, ctx: Ctx, userId: string, password: string) {
  assertCan(role(ctx), "users:manage");
  const weak = validatePasswordStrength(password);
  if (weak) throw new DomainError(weak, {}, "password");
  const [u] = await db.select().from(users).where(and(eq(users.id, userId), eq(users.orgId, ctx.orgId)));
  if (!u) throw new NotFoundError("user");
  await db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, u.id));
  await revokeAllSessions(db, u.id);
  await writeAudit(db, ctx, { action: "user.password_reset_by_manager", entityType: "user", entityId: u.id, elevated: true });
}

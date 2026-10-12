"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { changeStaffRole, forceSignOut, inviteStaff, resetTemplate, saveTemplate, setStaffActive, updateOrgSettings, upsertCategory, completeOnboarding } from "@/domain/organisation";
import { orgPrefs } from "@/domain/notifications";
import { revokeOwnSession } from "@/domain/auth";
import { writeAudit } from "@/domain/audit";
import { parseForm, staffAction } from "@/lib/action";
import { parsePercentToBp } from "@/lib/money";
import { saveFile } from "@/lib/storage";
import { normalisePhone } from "@/lib/phone";

const opt = z.string().optional().transform((v) => (v && v.trim() ? v.trim() : null));
const pct = (min = 0) =>
  z.string().transform((v, c) => {
    const bp = parsePercentToBp(v);
    if (bp === null || bp < min) {
      c.addIssue({ code: "custom", message: "err.invalid_percent" });
      return z.NEVER;
    }
    return bp;
  });
const pctOpt = z.string().optional().transform((v, c) => {
  if (!v || !v.trim()) return null;
  const bp = parsePercentToBp(v);
  if (bp === null) {
    c.addIssue({ code: "custom", message: "err.invalid_percent" });
    return z.NEVER;
  }
  return bp;
});

export const updateOrgAction = staffAction("settings:manage", async ({ c, form, t }) => {
  const v = parseForm(z.object({ name: z.string().min(2, "err.name_required"), nameAr: opt, phone: opt, email: opt, address: opt, crNumber: opt, defaultLocale: z.enum(["en", "ar"]) }), form, t);
  let logoFileId: string | undefined;
  const f = form.get("logo");
  if (f && typeof f !== "string" && f.size > 0) logoFileId = await saveFile(c.db, { orgId: c.ctx.orgId, name: f.name, data: Buffer.from(await f.arrayBuffer()), category: "logo", createdBy: c.ctx.actor.id });
  await updateOrgSettings(c.db, c.ctx, { ...v, phone: v.phone ? (normalisePhone(v.phone) ?? v.phone) : null, ...(logoFileId ? { logoFileId } : {}) });
  return { message: "msg.saved", revalidate: ["/settings", "/dashboard"] };
});

export const updateFinanceAction = staffAction("settings:manage", async ({ c, form, t }) => {
  const v = parseForm(
    z.object({
      defaultCommission: pct(),
      defaultPayoutFrequency: z.enum(["monthly", "quarterly", "semi_annual", "annual", "other"]),
      receiptPrefix: z.string().min(1, "err.invalid_prefix").max(8, "err.invalid_prefix"),
      rentCap: pctOpt,
      contractAlertDays: z.coerce.number().int().min(1, "err.invalid_number").max(365, "err.invalid_number"),
      gatewayFee: pct(),
      gatewayFeeMode: z.enum(["office_absorbs", "owner_net", "owner_line"]),
      vatBp: pct(),
      onlinePayments: z.string().optional(),
      tenantSchedule: z.string().optional(),
      vatEnabled: z.string().optional(),
    }),
    form,
    t,
  );
  await updateOrgSettings(c.db, c.ctx, {
    defaultCommissionBp: v.defaultCommission,
    defaultPayoutFrequency: v.defaultPayoutFrequency,
    receiptPrefix: v.receiptPrefix.toUpperCase(),
    rentIncreaseCapBp: v.rentCap,
    contractAlertDays: v.contractAlertDays,
    gatewayFeeBp: v.gatewayFee,
    gatewayFeeMode: v.gatewayFeeMode,
    vatBp: v.vatBp,
    vatEnabled: !!v.vatEnabled,
    onlinePaymentsEnabled: !!v.onlinePayments,
    tenantScheduleVisible: !!v.tenantSchedule,
  });
  return { message: "msg.saved", revalidate: ["/settings"] };
});

export const updateNotificationPrefsAction = staffAction("settings:manage", async ({ c, form, t }) => {
  const v = parseForm(
    z.object({
      whatsapp: z.string().optional(),
      sms: z.string().optional(),
      email: z.string().optional(),
      quiet: z.string().optional(),
      quietStart: z.coerce.number().int().min(0).max(23),
      quietEnd: z.coerce.number().int().min(0).max(23),
      reminders: z.string().optional(),
      chequeDue: z.string().optional(),
      chequeBounced: z.string().optional(),
      maintenanceNew: z.string().optional(),
      contractExpiring: z.string().optional(),
    }),
    form,
    t,
  );
  const prev = await orgPrefs(c.db, c.ctx.orgId);
  const days = (v.reminders ?? "").split(/[,\s]+/).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 60);
  await updateOrgSettings(c.db, c.ctx, {
    notificationPrefs: {
      ...prev,
      channels: { whatsapp: !!v.whatsapp, sms: !!v.sms, email: !!v.email },
      quietHours: { enabled: !!v.quiet, startHour: v.quietStart, endHour: v.quietEnd },
      reminderDaysBefore: days.length ? days : [7, 1],
      staffAlerts: { chequeDue: !!v.chequeDue, chequeBounced: !!v.chequeBounced, maintenanceNew: !!v.maintenanceNew, contractExpiring: !!v.contractExpiring },
    },
  });
  return { message: "msg.saved", revalidate: ["/settings"] };
});

export const upsertCategoryAction = staffAction("settings:manage", async ({ c, form, t }) => {
  const v = parseForm(z.object({ id: z.string().optional(), nameEn: z.string().min(2, "err.name_required"), nameAr: opt, active: z.string().optional() }), form, t);
  await upsertCategory(c.db, c.ctx, { id: v.id || undefined, nameEn: v.nameEn, nameAr: v.nameAr, active: v.id ? !!v.active : true });
  return { message: "msg.saved", revalidate: ["/settings"] };
});

export const inviteStaffAction = staffAction("users:manage", async ({ c, form, t }) => {
  const v = parseForm(z.object({ name: z.string().min(2, "err.name_required"), email: z.string().email("err.invalid_email"), phone: opt, role: z.enum(["manager", "accounts", "maintenance", "contracts"]), password: z.string().min(1, "err.password_too_short"), locale: z.enum(["en", "ar"]) }), form, t);
  await inviteStaff(c.db, c.ctx, v);
  return { message: "msg.staff_added", revalidate: ["/settings"] };
});

export const changeRoleAction = staffAction("users:manage", async ({ c, form, t }) => {
  const v = parseForm(z.object({ id: z.string().uuid(), role: z.enum(["manager", "accounts", "maintenance", "contracts"]) }), form, t);
  await changeStaffRole(c.db, c.ctx, v.id, v.role);
  return { message: "msg.saved", revalidate: ["/settings"] };
});

export const setActiveAction = staffAction("users:manage", async ({ c, form, t }) => {
  const v = parseForm(z.object({ id: z.string().uuid(), active: z.enum(["0", "1"]) }), form, t);
  await setStaffActive(c.db, c.ctx, v.id, v.active === "1");
  return { message: "msg.saved", revalidate: ["/settings"] };
});

export const forceSignOutAction = staffAction("users:manage", async ({ c, form, t }) => {
  await forceSignOut(c.db, c.ctx, parseForm(z.object({ id: z.string().uuid() }), form, t).id);
  return { message: "msg.signed_out", revalidate: ["/settings"] };
});

export const saveTemplateAction = staffAction("settings:manage", async ({ c, form, t }) => {
  const v = parseForm(z.object({ key: z.string(), locale: z.enum(["en", "ar"]), body: z.string().min(5, "err.body_required") }), form, t);
  await saveTemplate(c.db, c.ctx, v);
  return { message: "msg.saved", revalidate: ["/settings"] };
});

export const resetTemplateAction = staffAction("settings:manage", async ({ c, form, t }) => {
  const v = parseForm(z.object({ key: z.string(), locale: z.enum(["en", "ar"]) }), form, t);
  await resetTemplate(c.db, c.ctx, v.key, v.locale);
  return { message: "msg.saved", revalidate: ["/settings"] };
});

export const toggleTwoFactorAction = staffAction(null, async ({ c, form }) => {
  const enabled = form.get("enabled") === "1";
  await c.db.update(users).set({ twoFactorEnabled: enabled }).where(eq(users.id, c.user.id));
  await writeAudit(c.db, c.ctx, { action: "user.two_factor_changed", entityType: "user", entityId: c.user.id, after: { enabled }, elevated: true });
  return { message: "msg.saved", revalidate: ["/settings"] };
});

export const finishOnboardingAction = staffAction("settings:manage", async ({ c }) => {
  await completeOnboarding(c.db, c.ctx);
  return { redirectTo: "/dashboard", message: "msg.onboarding_done" };
});

export const revokeSessionAction = staffAction(null, async ({ c, form, t }) => {
  const v = parseForm(z.object({ id: z.string().uuid() }), form, t);
  await revokeOwnSession(c.db, c.user.id, v.id);
  return { message: "msg.signed_out", revalidate: ["/settings"] };
});

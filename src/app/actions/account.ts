"use server";

import { z } from "zod";
import { changePassword, issueManualTenantCode, resolveSession } from "@/domain/auth";
import { resetStaffPasswordByManager } from "@/domain/organisation";
import { createOfficeByPlatform } from "@/domain/platform";
import { parseForm, staffAction, tenantAction } from "@/lib/action";
import { getBaseUrl, getSessionToken } from "@/lib/session";
import { deleteTenant, disableTenantLogin, issueTenantLogin } from "@/domain/tenants";

const uuid = z.string().uuid("err.not_found");
const pwForm = z.object({ current: z.string().min(1, "err.required"), next: z.string().min(1, "err.password_too_short") });

async function currentSessionId(): Promise<string> {
  const token = await getSessionToken();
  return token ? ((await resolveSession(await (await import("@/db/client")).getDb(), token))?.sessionId ?? "") : "";
}

export const changeStaffPasswordAction = staffAction(null, async ({ c, form, t }) => {
  const v = parseForm(pwForm, form, t);
  await changePassword(c.db, { kind: "staff", id: c.user.id, current: v.current, next: v.next, keepSessionId: await currentSessionId() });
  return { message: "msg.password_changed" };
});

export const changeTenantPasswordAction = tenantAction(async ({ c, form, t }) => {
  const v = parseForm(pwForm, form, t);
  await changePassword(c.db, { kind: "tenant", id: c.tenant.id, current: v.current, next: v.next, keepSessionId: await currentSessionId() });
  return { message: "msg.password_changed" };
});

/** The office hands the tenant a one-time code (phone call or in person) while SMS is not connected. */
export const manualTenantCodeAction = staffAction("tenants:manage", async ({ c, form, t }) => {
  const { id } = parseForm(z.object({ id: uuid }), form, t);
  const res = await issueManualTenantCode(c.db, c.ctx, id);
  return { data: { code: res.code, validHours: res.validHours, purpose: res.purpose } };
});

export const resetStaffPasswordAction = staffAction("users:manage", async ({ c, form, t }) => {
  const v = parseForm(z.object({ id: uuid, password: z.string().min(1, "err.password_too_short") }), form, t);
  await resetStaffPasswordByManager(c.db, c.ctx, v.id, v.password);
  return { message: "msg.staff_password_reset" };
});

export const createOfficeAction = staffAction("platform:manage", async ({ c, form, t }) => {
  const v = parseForm(
    z.object({
      orgName: z.string().min(2, "err.name_required"),
      orgNameAr: z.string().optional(),
      adminName: z.string().min(2, "err.name_required"),
      email: z.string().email("err.invalid_email"),
      phone: z.string().min(6, "err.invalid_phone"),
      password: z.string().min(1, "err.password_too_short"),
      locale: z.enum(["en", "ar"]),
    }),
    form,
    t,
  );
  await createOfficeByPlatform(c.db, { id: c.user.id, name: c.user.name }, v);
  return { message: "msg.office_created", revalidate: ["/platform"] };
});

export const issueTenantLoginAction = staffAction("tenants:manage", async ({ c, form, t }) => {
  const { id } = parseForm(z.object({ id: uuid }), form, t);
  const res = await issueTenantLogin(c.db, c.ctx, id);
  const url = `${await getBaseUrl()}/portal/login`;
  return { data: { idNumber: res.idNumber, password: res.password, url, name: res.name }, revalidate: [`/tenants/${id}`] };
});

export const disableTenantLoginAction = staffAction("tenants:manage", async ({ c, form, t }) => {
  const { id } = parseForm(z.object({ id: uuid }), form, t);
  await disableTenantLogin(c.db, c.ctx, id);
  return { message: "msg.tenant_login_disabled", revalidate: [`/tenants/${id}`] };
});

export const deleteTenantAction = staffAction("tenants:manage", async ({ c, form, t }) => {
  const { id } = parseForm(z.object({ id: uuid }), form, t);
  await deleteTenant(c.db, c.ctx, id);
  return { message: "msg.tenant_deleted", redirectTo: "/tenants" };
});

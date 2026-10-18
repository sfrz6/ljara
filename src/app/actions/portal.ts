"use server";

import { z } from "zod";
import { activateTenant, requestTenantOtp, resetTenantPassword, tenantLogin } from "@/domain/auth";
import { completePaymentIntent, createPaymentIntent } from "@/domain/payments";
import { getDb } from "@/db/client";
import { ForbiddenError } from "@/domain/errors";
import { isDemoMode } from "@/lib/demo";
import { publicAction, parseForm, tenantAction } from "@/lib/action";
import { getClientMeta, setLocaleCookie, setSessionCookie } from "@/lib/session";
import { tenants } from "@/db/schema";
import { eq } from "drizzle-orm";

const idNumber = z.string().min(3, "err.required");

export const tenantLoginAction = publicAction(async ({ form, t }) => {
  const v = parseForm(z.object({ idNumber, password: z.string().min(1, "err.required") }), form, t);
  const db = await getDb();
  const { userAgent } = await getClientMeta();
  const res = await tenantLogin(db, { ...v, userAgent });
  await setSessionCookie(res.token, res.expiresAt);
  const [tn] = await db.select({ locale: tenants.locale }).from(tenants).where(eq(tenants.id, res.tenantId));
  await setLocaleCookie(tn.locale);
  return { redirectTo: "/portal" };
});

/** Always answers the same way, so nobody can learn whether an ID number exists (CR-12.5). */
export const requestOtpAction = publicAction(async ({ form, t }) => {
  const v = parseForm(z.object({ idNumber, purpose: z.enum(["tenant_activation", "tenant_reset"]) }), form, t);
  await requestTenantOtp(await getDb(), v);
  return { message: "portal.code_sent", data: { sentAt: Date.now() } };
});

export const activateAction = publicAction(async ({ form, t }) => {
  const v = parseForm(z.object({ idNumber, code: z.string().length(6, "err.otp_invalid"), password: z.string().min(1, "err.password_too_short") }), form, t);
  const db = await getDb();
  const { userAgent } = await getClientMeta();
  const res = await activateTenant(db, { ...v, userAgent });
  await setSessionCookie(res.token, res.expiresAt);
  return { message: "portal.activated", redirectTo: "/portal" };
});

export const resetPasswordAction = publicAction(async ({ form, t }) => {
  const v = parseForm(z.object({ idNumber, code: z.string().length(6, "err.otp_invalid"), password: z.string().min(1, "err.password_too_short") }), form, t);
  await resetTenantPassword(await getDb(), v);
  return { message: "portal.password_reset", redirectTo: "/portal/login" };
});

export const payNowAction = tenantAction(async ({ c, form, t }) => {
  const { itemId } = parseForm(z.object({ itemId: z.string().uuid("err.not_found") }), form, t);
  const intent = await createPaymentIntent(c.db, { orgId: c.tenant.orgId, tenantId: c.tenant.id }, itemId);
  return { redirectTo: `/portal/pay/${intent.id}` };
});

export const gatewayAction = tenantAction(async ({ c, form, t }) => {
  // The simulated gateway callback marks a payment as paid. It exists only in the demo environment.
  if (!isDemoMode()) throw new ForbiddenError();
  const v = parseForm(z.object({ intentId: z.string().uuid("err.not_found"), outcome: z.enum(["success", "failure"]), reason: z.string().optional() }), form, t);
  const res = await completePaymentIntent(c.db, { orgId: c.tenant.orgId, tenantId: c.tenant.id }, v.intentId, v.outcome === "success" ? { result: "success" } : { result: "failure", reason: v.reason || "card_declined" });
  return { redirectTo: `/portal/pay/${v.intentId}/result?status=${res.status}` };
});

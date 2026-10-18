"use server";

import { z } from "zod";
import { DomainError } from "@/domain/errors";
import { signupEnabled } from "@/lib/features";
import { getDb } from "@/db/client";
import { signupOrganisation } from "@/domain/organisation";
import { completeStaff2fa, createSession, requestStaffReset, resetStaffPassword, resolveSession, staffLogin } from "@/domain/auth";
import { publicAction, parseForm } from "@/lib/action";
import { getClientMeta, getSessionToken, setLocaleCookie, setSessionCookie } from "@/lib/session";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

const loginSchema = z.object({
  email: z.string().min(3, "err.required"),
  password: z.string().min(1, "err.required"),
});

export const loginAction = publicAction(async ({ form, t }) => {
  const input = parseForm(loginSchema, form, t);
  const db = await getDb();
  const { userAgent } = await getClientMeta();
  const res = await staffLogin(db, { ...input, userAgent });
  await setSessionCookie(res.token, res.expiresAt);
  const [u] = await db.select().from(users).where(eq(users.id, res.userId));
  await setLocaleCookie(u.locale);
  if (res.pending2fa) return { redirectTo: "/login/verify" };
  return { redirectTo: u.role === "platform_admin" ? "/platform" : "/dashboard" };
});

const signupSchema = z.object({
  orgName: z.string().min(2, "err.name_required"),
  orgNameAr: z.string().optional(),
  adminName: z.string().min(2, "err.name_required"),
  email: z.string().email("err.invalid_email"),
  phone: z.string().min(6, "err.invalid_phone"),
  password: z.string().min(1, "err.password_too_short"),
  locale: z.enum(["en", "ar"]),
});

export const signupAction = publicAction(async ({ form, t }) => {
  if (!signupEnabled()) throw new DomainError("signup_disabled");
  const input = parseForm(signupSchema, form, t);
  const db = await getDb();
  const { user } = await signupOrganisation(db, input);
  const { userAgent } = await getClientMeta();
  const session = await createSession(db, { kind: "staff", userId: user.id, orgId: user.orgId, userAgent });
  await setSessionCookie(session.token, session.expiresAt);
  await setLocaleCookie(input.locale);
  return { redirectTo: "/onboarding" };
});


export const verify2faAction = publicAction(async ({ form, t }) => {
  const v = parseForm(z.object({ code: z.string().length(6, "err.otp_invalid") }), form, t);
  const db = await getDb();
  const token = await getSessionToken();
  if (!token) return { redirectTo: "/login" };
  const raw = await resolveSession(db, token);
  if (!raw || raw.kind !== "staff") return { redirectTo: "/login" };
  await completeStaff2fa(db, { sessionId: raw.sessionId, userId: raw.user.id, code: v.code });
  return { redirectTo: raw.user.role === "platform_admin" ? "/platform" : "/dashboard" };
});

export const requestStaffResetAction = publicAction(async ({ form, t }) => {
  const v = parseForm(z.object({ email: z.string().email("err.invalid_email") }), form, t);
  await requestStaffReset(await getDb(), v.email);
  return { message: "portal.code_sent" };
});

export const resetStaffAction = publicAction(async ({ form, t }) => {
  const v = parseForm(z.object({ email: z.string().email("err.invalid_email"), code: z.string().length(6, "err.otp_invalid"), password: z.string().min(1, "err.password_too_short") }), form, t);
  await resetStaffPassword(await getDb(), v);
  return { message: "portal.password_reset", redirectTo: "/login" };
});

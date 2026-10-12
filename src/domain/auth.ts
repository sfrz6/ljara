import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { DB } from "@/db/client";
import { organisations, otps, rateLimits, sessions, tenants, users } from "@/db/schema";
import { DEMO_OTP, isDemoMode } from "@/lib/demo";
import { normalisePhone } from "@/lib/phone";
import { hashPassword, randomToken, sha256, validatePasswordStrength, verifyPassword } from "@/lib/password";
import { writeAudit } from "./audit";
import { DomainError } from "./errors";
import { notifyTenant } from "./notifications";
import type { Role } from "./permissions";

/** Security policy (proposal D13). */
export const POLICY = {
  otpTtlMinutes: 10,
  otpMaxAttempts: 3,
  otpMaxPerHour: 5,
  staffSessionHours: 12,
  tenantSessionDays: 30,
  maxFailedLogins: 5,
  lockoutMinutes: 15,
};

/* ------------------------------ Rate limiting ------------------------------ */

async function checkLocked(q: DB, key: string): Promise<void> {
  const [row] = await q.select().from(rateLimits).where(eq(rateLimits.key, key));
  if (row?.lockedUntil && row.lockedUntil > new Date()) {
    throw new DomainError("too_many_attempts", { minutes: POLICY.lockoutMinutes });
  }
}

async function registerFailure(q: DB, key: string): Promise<void> {
  const windowMs = POLICY.lockoutMinutes * 60_000;
  const [row] = await q.select().from(rateLimits).where(eq(rateLimits.key, key));
  const now = new Date();
  if (!row || now.getTime() - row.windowStartedAt.getTime() > windowMs) {
    await q
      .insert(rateLimits)
      .values({ key, count: 1, windowStartedAt: now, lockedUntil: null })
      .onConflictDoUpdate({ target: rateLimits.key, set: { count: 1, windowStartedAt: now, lockedUntil: null } });
    return;
  }
  const count = row.count + 1;
  await q
    .update(rateLimits)
    .set({ count, lockedUntil: count >= POLICY.maxFailedLogins ? new Date(now.getTime() + windowMs) : null })
    .where(eq(rateLimits.key, key));
}

async function clearFailures(q: DB, key: string): Promise<void> {
  await q.delete(rateLimits).where(eq(rateLimits.key, key));
}

/** Generic hourly counter used for OTP requests per phone number. */
async function hitHourly(q: DB, key: string, max: number): Promise<void> {
  const now = new Date();
  const [row] = await q.select().from(rateLimits).where(eq(rateLimits.key, key));
  if (!row || now.getTime() - row.windowStartedAt.getTime() > 3_600_000) {
    await q
      .insert(rateLimits)
      .values({ key, count: 1, windowStartedAt: now })
      .onConflictDoUpdate({ target: rateLimits.key, set: { count: 1, windowStartedAt: now, lockedUntil: null } });
    return;
  }
  if (row.count >= max) throw new DomainError("otp_rate_limited");
  await q.update(rateLimits).set({ count: row.count + 1 }).where(eq(rateLimits.key, key));
}

/* --------------------------------- Sessions -------------------------------- */

export interface NewSession {
  kind: "staff" | "tenant";
  userId?: string;
  tenantId?: string;
  orgId: string | null;
  userAgent?: string | null;
  pending2fa?: boolean;
}

export async function createSession(q: DB, input: NewSession): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken(32);
  const ttl =
    input.kind === "staff" ? POLICY.staffSessionHours * 3_600_000 : POLICY.tenantSessionDays * 86_400_000;
  const expiresAt = new Date(Date.now() + ttl);
  await q.insert(sessions).values({
    tokenHash: sha256(token),
    kind: input.kind,
    userId: input.userId ?? null,
    tenantId: input.tenantId ?? null,
    orgId: input.orgId,
    userAgent: input.userAgent?.slice(0, 300) ?? null,
    expiresAt,
    pending2fa: input.pending2fa ?? false,
  });
  return { token, expiresAt };
}

export async function revokeSession(q: DB, token: string): Promise<void> {
  await q.update(sessions).set({ revokedAt: new Date() }).where(eq(sessions.tokenHash, sha256(token)));
}

export async function revokeAllSessions(q: DB, userId: string): Promise<void> {
  await q.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}

export type ResolvedSession =
  | {
      kind: "staff";
      sessionId: string;
      pending2fa: boolean;
      user: { id: string; orgId: string | null; email: string; name: string; role: Role; locale: "en" | "ar"; twoFactorEnabled: boolean };
      org: { id: string; name: string; nameAr: string | null; defaultLocale: "en" | "ar" } | null;
    }
  | {
      kind: "tenant";
      sessionId: string;
      tenant: { id: string; orgId: string; nameEn: string; nameAr: string | null; locale: "en" | "ar" };
      org: { id: string; name: string; defaultLocale: "en" | "ar" };
    };

export async function resolveSession(q: DB, token: string | undefined | null): Promise<ResolvedSession | null> {
  if (!token) return null;
  const [s] = await q
    .select()
    .from(sessions)
    .where(and(eq(sessions.tokenHash, sha256(token)), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())));
  if (!s) return null;

  if (s.kind === "staff" && s.userId) {
    const [u] = await q.select().from(users).where(eq(users.id, s.userId));
    if (!u || !u.active) return null;
    let org: { id: string; name: string; nameAr: string | null; defaultLocale: "en" | "ar" } | null = null;
    if (u.orgId) {
      const [o] = await q.select().from(organisations).where(eq(organisations.id, u.orgId));
      if (!o || o.status !== "active") return null;
      org = { id: o.id, name: o.name, nameAr: o.nameAr, defaultLocale: o.defaultLocale };
    }
    return {
      kind: "staff",
      sessionId: s.id,
      pending2fa: s.pending2fa,
      user: {
        id: u.id,
        orgId: u.orgId,
        email: u.email,
        name: u.name,
        role: u.role,
        locale: u.locale,
        twoFactorEnabled: u.twoFactorEnabled,
      },
      org,
    };
  }
  if (s.kind === "tenant" && s.tenantId) {
    const [t] = await q.select().from(tenants).where(eq(tenants.id, s.tenantId));
    if (!t || t.status === "archived" || !t.activatedAt) return null;
    const [o] = await q.select().from(organisations).where(eq(organisations.id, t.orgId));
    if (!o || o.status !== "active") return null;
    return {
      kind: "tenant",
      sessionId: s.id,
      tenant: { id: t.id, orgId: t.orgId, nameEn: t.nameEn, nameAr: t.nameAr, locale: t.locale },
      org: { id: o.id, name: o.name, defaultLocale: o.defaultLocale },
    };
  }
  return null;
}

/* ----------------------------------- OTP ----------------------------------- */

function newOtpCode(): string {
  if (isDemoMode()) return DEMO_OTP;
  return String(100000 + Math.floor(Math.random() * 900000));
}

/**
 * Issue an OTP. The code goes out by SMS through the notification service (simulated in this build).
 * Returns the otp id; the code itself is never returned to the caller.
 */
async function issueOtp(
  q: DB,
  input: { purpose: "tenant_activation" | "tenant_reset" | "staff_reset" | "staff_2fa"; subjectId: string; phone: string | null },
): Promise<{ otpId: string; code: string }> {
  if (input.phone) await hitHourly(q, `otp:${input.phone}`, POLICY.otpMaxPerHour);
  // Invalidate earlier unused codes for the same purpose.
  await q
    .update(otps)
    .set({ consumedAt: new Date() })
    .where(and(eq(otps.subjectId, input.subjectId), eq(otps.purpose, input.purpose), isNull(otps.consumedAt)));
  const code = newOtpCode();
  const [row] = await q
    .insert(otps)
    .values({
      purpose: input.purpose,
      subjectId: input.subjectId,
      phone: input.phone,
      codeHash: sha256(code),
      expiresAt: new Date(Date.now() + POLICY.otpTtlMinutes * 60_000),
    })
    .returning({ id: otps.id });
  return { otpId: row.id, code };
}

/** Constant behaviour for the OTP check. In demo mode the fixed code is accepted (centralised in lib/demo.ts). */
export async function verifyOtp(
  q: DB,
  input: { purpose: "tenant_activation" | "tenant_reset" | "staff_reset" | "staff_2fa"; subjectId: string; code: string },
): Promise<void> {
  const [row] = await q
    .select()
    .from(otps)
    .where(and(eq(otps.subjectId, input.subjectId), eq(otps.purpose, input.purpose), isNull(otps.consumedAt)))
    .orderBy(sql`${otps.createdAt} desc`)
    .limit(1);
  if (!row) throw new DomainError("otp_invalid");
  if (row.expiresAt < new Date()) throw new DomainError("otp_expired");
  if (row.attempts >= POLICY.otpMaxAttempts) throw new DomainError("otp_attempts");
  const ok = (isDemoMode() && input.code === DEMO_OTP) || sha256(input.code) === row.codeHash;
  if (!ok) {
    await q.update(otps).set({ attempts: row.attempts + 1 }).where(eq(otps.id, row.id));
    throw new DomainError(row.attempts + 1 >= POLICY.otpMaxAttempts ? "otp_attempts" : "otp_invalid");
  }
  await q.update(otps).set({ consumedAt: new Date() }).where(eq(otps.id, row.id));
}

/* ---------------------------------- Tenant ---------------------------------- */

async function findTenantsById(q: DB, idNumber: string) {
  return q.select().from(tenants).where(eq(tenants.idNumber, idNumber.trim()));
}

/**
 * Ask for an activation or reset code. The response never reveals whether the ID exists (CR-12.5):
 * callers always show the same "if the account exists, a code was sent" message.
 */
export async function requestTenantOtp(
  q: DB,
  input: { idNumber: string; purpose: "tenant_activation" | "tenant_reset" },
): Promise<void> {
  const candidates = await findTenantsById(q, input.idNumber);
  for (const t of candidates) {
    if (t.status === "archived") continue;
    if (input.purpose === "tenant_activation" && t.activatedAt) continue;
    if (input.purpose === "tenant_reset" && !t.activatedAt) continue;
    try {
      const { code } = await issueOtp(q, { purpose: input.purpose, subjectId: t.id, phone: t.phone });
      await notifyTenant(q, {
        orgId: t.orgId,
        tenantId: t.id,
        template: input.purpose === "tenant_activation" ? "otp_activation" : "otp_reset",
        vars: { code },
        idempotencyKey: `${input.purpose}:${t.id}:${Date.now()}`,
      });
    } catch (e) {
      if (!(e instanceof DomainError)) throw e; // rate limited: stay silent to avoid leaking existence
    }
  }
}

/** Activate a tenant account: verifies the OTP and sets the first password. */
export async function activateTenant(
  q: DB,
  input: { idNumber: string; code: string; password: string; userAgent?: string | null },
): Promise<{ token: string; expiresAt: Date; tenantId: string; orgId: string }> {
  const weak = validatePasswordStrength(input.password);
  if (weak) throw new DomainError(weak, {}, "password");
  const candidates = (await findTenantsById(q, input.idNumber)).filter((t) => !t.activatedAt && t.status !== "archived");
  for (const t of candidates) {
    try {
      await verifyOtp(q, { purpose: "tenant_activation", subjectId: t.id, code: input.code });
    } catch (e) {
      if (candidates.length === 1) throw e;
      continue;
    }
    await q
      .update(tenants)
      .set({ passwordHash: await hashPassword(input.password), activatedAt: new Date() })
      .where(eq(tenants.id, t.id));
    await writeAudit(
      q,
      { orgId: t.orgId, actor: { kind: "tenant", id: t.id, name: t.nameEn, role: "tenant" } },
      { action: "tenant.activated", entityType: "tenant", entityId: t.id, elevated: true },
    );
    const session = await createSession(q, { kind: "tenant", tenantId: t.id, orgId: t.orgId, userAgent: input.userAgent });
    return { ...session, tenantId: t.id, orgId: t.orgId };
  }
  throw new DomainError("otp_invalid");
}

export async function resetTenantPassword(
  q: DB,
  input: { idNumber: string; code: string; password: string },
): Promise<void> {
  const weak = validatePasswordStrength(input.password);
  if (weak) throw new DomainError(weak, {}, "password");
  const candidates = (await findTenantsById(q, input.idNumber)).filter((t) => t.activatedAt && t.status !== "archived");
  for (const t of candidates) {
    try {
      await verifyOtp(q, { purpose: "tenant_reset", subjectId: t.id, code: input.code });
    } catch (e) {
      if (candidates.length === 1) throw e;
      continue;
    }
    await q.update(tenants).set({ passwordHash: await hashPassword(input.password) }).where(eq(tenants.id, t.id));
    await q.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.tenantId, t.id), isNull(sessions.revokedAt)));
    await writeAudit(
      q,
      { orgId: t.orgId, actor: { kind: "tenant", id: t.id, name: t.nameEn, role: "tenant" } },
      { action: "auth.password_reset", entityType: "tenant", entityId: t.id, elevated: true },
    );
    return;
  }
  throw new DomainError("otp_invalid");
}

export async function tenantLogin(
  q: DB,
  input: { idNumber: string; password: string; userAgent?: string | null },
): Promise<{ token: string; expiresAt: Date; tenantId: string }> {
  const key = `login:tenant:${input.idNumber.trim()}`;
  await checkLocked(q, key);
  const candidates = (await findTenantsById(q, input.idNumber)).filter((t) => t.activatedAt && t.status !== "archived");
  let matched: (typeof candidates)[number] | null = null;
  if (candidates.length === 0) {
    await verifyPassword(input.password, null);
  }
  for (const t of candidates) {
    if (await verifyPassword(input.password, t.passwordHash)) {
      matched = t;
      break;
    }
  }
  if (!matched) {
    await registerFailure(q, key);
    // Failed logins are security events: retained at the elevated class (proposal 4.9).
    await writeAudit(
      q,
      { orgId: candidates[0]?.orgId ?? null, actor: { kind: "tenant", id: null, name: "anonymous", role: "tenant" } },
      { action: "auth.failed_login", entityType: "tenant", meta: { surface: "tenant" } },
    );
    throw new DomainError("invalid_credentials");
  }
  // Former tenants keep read access for a limited period (G4).
  if (matched.status === "former" && matched.portalAccessUntil && matched.portalAccessUntil < new Date().toISOString().slice(0, 10)) {
    throw new DomainError("invalid_credentials");
  }
  await clearFailures(q, key);
  await q.update(tenants).set({ lastLoginAt: new Date() }).where(eq(tenants.id, matched.id));
  const session = await createSession(q, { kind: "tenant", tenantId: matched.id, orgId: matched.orgId, userAgent: input.userAgent });
  return { ...session, tenantId: matched.id };
}

/* ----------------------------------- Staff ----------------------------------- */

export async function staffLogin(
  q: DB,
  input: { email: string; password: string; userAgent?: string | null },
): Promise<{ token: string; expiresAt: Date; userId: string; pending2fa: boolean }> {
  const email = input.email.trim().toLowerCase();
  const key = `login:staff:${email}`;
  await checkLocked(q, key);
  const [u] = await q.select().from(users).where(eq(users.email, email));
  const ok = await verifyPassword(input.password, u?.passwordHash);
  if (!u || !ok || !u.active) {
    await registerFailure(q, key);
    await writeAudit(
      q,
      { orgId: u?.orgId ?? null, actor: { kind: "user", id: null, name: email, role: "system" } },
      { action: "auth.failed_login", entityType: "user", meta: { surface: "staff" } },
    );
    throw new DomainError("invalid_credentials");
  }
  if (u.orgId) {
    const [o] = await q.select({ status: organisations.status }).from(organisations).where(eq(organisations.id, u.orgId));
    if (o?.status === "suspended") throw new DomainError("org_suspended");
  }
  await clearFailures(q, key);
  await q.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, u.id));
  const pending2fa = u.twoFactorEnabled;
  if (pending2fa) await issueOtp(q, { purpose: "staff_2fa", subjectId: u.id, phone: u.phone });
  const session = await createSession(q, { kind: "staff", userId: u.id, orgId: u.orgId, userAgent: input.userAgent, pending2fa });
  return { ...session, userId: u.id, pending2fa };
}

export async function completeStaff2fa(q: DB, input: { sessionId: string; userId: string; code: string }): Promise<void> {
  await verifyOtp(q, { purpose: "staff_2fa", subjectId: input.userId, code: input.code });
  await q.update(sessions).set({ pending2fa: false }).where(eq(sessions.id, input.sessionId));
}

export async function requestStaffReset(q: DB, email: string): Promise<void> {
  const [u] = await q.select().from(users).where(eq(users.email, email.trim().toLowerCase()));
  if (!u || !u.active) return;
  try {
    await issueOtp(q, { purpose: "staff_reset", subjectId: u.id, phone: u.phone });
  } catch (e) {
    if (!(e instanceof DomainError)) throw e;
  }
}

export async function resetStaffPassword(q: DB, input: { email: string; code: string; password: string }): Promise<void> {
  const weak = validatePasswordStrength(input.password);
  if (weak) throw new DomainError(weak, {}, "password");
  const [u] = await q.select().from(users).where(eq(users.email, input.email.trim().toLowerCase()));
  if (!u) throw new DomainError("otp_invalid");
  await verifyOtp(q, { purpose: "staff_reset", subjectId: u.id, code: input.code });
  await q.update(users).set({ passwordHash: await hashPassword(input.password) }).where(eq(users.id, u.id));
  await revokeAllSessions(q, u.id);
  await writeAudit(
    q,
    { orgId: u.orgId, actor: { kind: "user", id: u.id, name: u.name, role: u.role } },
    { action: "auth.password_reset", entityType: "user", entityId: u.id, elevated: true },
  );
}

export { normalisePhone };

/** Signed-in devices of one user, newest first (M-02 session management and device listing). */
export async function listSessions(q: DB, userId: string) {
  return q
    .select({ id: sessions.id, userAgent: sessions.userAgent, createdAt: sessions.createdAt, lastSeenAt: sessions.lastSeenAt })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt), gt(sessions.expiresAt, new Date())))
    .orderBy(sql`${sessions.lastSeenAt} desc`);
}

export async function revokeOwnSession(q: DB, userId: string, sessionId: string): Promise<void> {
  await q.update(sessions).set({ revokedAt: new Date() }).where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));
}

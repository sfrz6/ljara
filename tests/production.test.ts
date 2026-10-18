import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import * as s from "@/db/schema";
import { activateTenant, changePassword, cleanupAuthTables, createSession, issueManualTenantCode, resolveSession, tenantLogin } from "@/domain/auth";
import { notifyTenant } from "@/domain/notifications";
import { createOfficeByPlatform } from "@/domain/platform";
import { resetStaffPasswordByManager } from "@/domain/organisation";
import { gatewayAvailable, signupEnabled } from "@/lib/features";
import { hashPassword, verifyPassword } from "@/lib/password";
import { buildWorld, type World } from "./fixtures";

let w: World;
beforeAll(async () => {
  w = await buildWorld();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("going live switches", () => {
  it("keeps the simulated gateway, open sign-up and simulated channels to demo mode", () => {
    expect(gatewayAvailable()).toBe(true);
    expect(signupEnabled()).toBe(true);
    vi.stubEnv("DEMO_MODE", "false");
    expect(gatewayAvailable()).toBe(false);
    expect(signupEnabled()).toBe(false);
    vi.stubEnv("SIGNUP_ENABLED", "true");
    expect(signupEnabled()).toBe(true);
    vi.stubEnv("PAYMENT_GATEWAY", "thawani");
    expect(gatewayAvailable()).toBe(true);
  });

  it("does not pretend to deliver SMS or WhatsApp outside demo mode", async () => {
    const [t] = await w.db.select().from(s.tenants).where(and(eq(s.tenants.orgId, w.orgId), eq(s.tenants.idNumber, "12345678")));
    vi.stubEnv("DEMO_MODE", "false");
    const res = await notifyTenant(w.db, { orgId: w.orgId, tenantId: t.id, template: "otp_reset", vars: { code: "000000" }, idempotencyKey: `prod-skip-${Date.now()}` });
    expect(res.status).not.toBe("sent");
    expect(res.status).not.toBe("delivered");
  });
});

describe("staff issued activation code", () => {
  it("lets the office activate a tenant with a real one-time code, once", async () => {
    const [t] = await w.db.select().from(s.tenants).where(and(eq(s.tenants.orgId, w.orgId), eq(s.tenants.idNumber, "87654321")));
    await expect(issueManualTenantCode(w.db, w.ctx.accounts, t.id)).rejects.toMatchObject({ code: "forbidden" });
    const { code, purpose } = await issueManualTenantCode(w.db, w.ctx.manager, t.id);
    expect(purpose).toBe("tenant_activation");
    expect(code).toMatch(/^\d{6}$/);
    vi.stubEnv("DEMO_MODE", "false");
    await expect(activateTenant(w.db, { idNumber: "87654321", code: "123456", password: "Strong-Pass-2026" })).rejects.toMatchObject({ code: "otp_invalid" });
    const res = await activateTenant(w.db, { idNumber: "87654321", code, password: "Strong-Pass-2026" });
    expect(res.tenantId).toBe(t.id);
    await expect(activateTenant(w.db, { idNumber: "87654321", code, password: "Strong-Pass-2026" })).rejects.toBeTruthy();
    const audit = await w.db.select().from(s.auditLog).where(and(eq(s.auditLog.entityId, t.id), eq(s.auditLog.action, "tenant.manual_code_issued")));
    expect(audit.length).toBe(1);
    expect(JSON.stringify(audit[0])).not.toContain(code);
  });

  it("cannot reach a tenant of another office", async () => {
    const [t] = await w.db.select().from(s.tenants).where(eq(s.tenants.orgId, w.orgId));
    await expect(issueManualTenantCode(w.db, w.ctxB, t.id)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("password changes", () => {
  it("requires the current password and signs the other devices out", async () => {
    const [u] = await w.db.select().from(s.users).where(eq(s.users.email, "accounts@alsahil.demo"));
    const keep = await createSession(w.db, { kind: "staff", userId: u.id, orgId: u.orgId });
    const other = await createSession(w.db, { kind: "staff", userId: u.id, orgId: u.orgId });
    const kept = (await resolveSession(w.db, keep.token))!;
    await expect(changePassword(w.db, { kind: "staff", id: u.id, current: "wrong", next: "Another-Pass-2026", keepSessionId: kept.sessionId })).rejects.toMatchObject({ code: "wrong_current_password" });
    await expect(changePassword(w.db, { kind: "staff", id: u.id, current: "Ijara-Demo-2026", next: "short", keepSessionId: kept.sessionId })).rejects.toBeTruthy();
    await changePassword(w.db, { kind: "staff", id: u.id, current: "Ijara-Demo-2026", next: "Another-Pass-2026", keepSessionId: kept.sessionId });
    expect(await resolveSession(w.db, keep.token)).not.toBeNull();
    expect(await resolveSession(w.db, other.token)).toBeNull();
    const [after] = await w.db.select().from(s.users).where(eq(s.users.id, u.id));
    expect(await verifyPassword("Another-Pass-2026", after.passwordHash)).toBe(true);
  });

  it("lets a tenant change theirs", async () => {
    const [t] = await w.db.select().from(s.tenants).where(and(eq(s.tenants.orgId, w.orgId), eq(s.tenants.idNumber, "12345678")));
    await changePassword(w.db, { kind: "tenant", id: t.id, current: "Ijara-Demo-2026", next: "Tenant-New-2026", keepSessionId: "" });
    await expect(tenantLogin(w.db, { idNumber: "12345678", password: "Ijara-Demo-2026" })).rejects.toBeTruthy();
    await expect(tenantLogin(w.db, { idNumber: "12345678", password: "Tenant-New-2026" })).resolves.toBeTruthy();
  });

  it("lets a manager reset a colleague but only inside the same office", async () => {
    const [mine] = await w.db.select().from(s.users).where(eq(s.users.email, "contracts@alsahil.demo"));
    await resetStaffPasswordByManager(w.db, w.ctx.manager, mine.id, "Reset-Pass-2026");
    const [after] = await w.db.select().from(s.users).where(eq(s.users.id, mine.id));
    expect(await verifyPassword("Reset-Pass-2026", after.passwordHash)).toBe(true);
    await expect(resetStaffPasswordByManager(w.db, w.ctxB, mine.id, "Reset-Pass-2026")).rejects.toBeTruthy();
    await expect(resetStaffPasswordByManager(w.db, w.ctx.accounts, mine.id, "Reset-Pass-2026")).rejects.toBeTruthy();
  });
});

describe("platform and housekeeping", () => {
  it("creates an office with its first manager", async () => {
    const [admin] = await w.db.select().from(s.users).where(eq(s.users.role, "platform_admin"));
    const res = await createOfficeByPlatform(w.db, { id: admin.id, name: admin.name }, {
      orgName: "Nizwa Lettings", adminName: "Said Al Harthy", email: "said@nizwa.example", phone: "91234567", password: "Office-Pass-2026", locale: "ar",
    });
    expect(res.user.role).toBe("manager");
    expect(res.org.onlinePaymentsEnabled).toBe(true);
  });

  it("removes expired sessions, spent codes and stale limits", async () => {
    const [u] = await w.db.select().from(s.users).where(eq(s.users.email, "manager@alsahil.demo"));
    await w.db.insert(s.sessions).values({ kind: "staff", userId: u.id, orgId: u.orgId, tokenHash: "x".repeat(64), expiresAt: new Date(Date.now() - 30 * 86_400_000) });
    const out = await cleanupAuthTables(w.db);
    expect(out.sessions).toBeGreaterThanOrEqual(1);
  });
});

void hashPassword;

describe("tenant login created by the office", () => {
  const mk = (idNumber: string, phone: string) => ({ nameEn: "Test Tenant", phone, idNumber, locale: "en" as const, consent: true });

  it("creates a working login, turns it off, and deletes a tenant with no history", async () => {
    const { createTenant, deleteTenant, disableTenantLogin, issueTenantLogin } = await import("@/domain/tenants");
    const { tenantLogin } = await import("@/domain/auth");
    const t = await createTenant(w.db, w.ctx.manager, mk("55550001", "+96895550001"));
    await expect(issueTenantLogin(w.db, w.ctx.accounts, t.id)).rejects.toBeTruthy();
    await expect(issueTenantLogin(w.db, w.ctxB, t.id)).rejects.toMatchObject({ code: "not_found" });
    const first = await issueTenantLogin(w.db, w.ctx.manager, t.id);
    expect(first.password.length).toBe(12);
    await expect(tenantLogin(w.db, { idNumber: "55550001", password: first.password })).resolves.toBeTruthy();
    const second = await issueTenantLogin(w.db, w.ctx.manager, t.id);
    await expect(tenantLogin(w.db, { idNumber: "55550001", password: first.password })).rejects.toBeTruthy();
    await expect(tenantLogin(w.db, { idNumber: "55550001", password: second.password })).resolves.toBeTruthy();
    await disableTenantLogin(w.db, w.ctx.manager, t.id);
    await expect(tenantLogin(w.db, { idNumber: "55550001", password: second.password })).rejects.toBeTruthy();
    await deleteTenant(w.db, w.ctx.manager, t.id);
    expect(await w.db.select().from(s.tenants).where(eq(s.tenants.id, t.id))).toHaveLength(0);
  });

  it("refuses to delete a tenant who has a contract", async () => {
    const { deleteTenant } = await import("@/domain/tenants");
    const [c] = await w.db.select({ tenantId: s.contracts.tenantId }).from(s.contracts).where(eq(s.contracts.orgId, w.orgId)).limit(1);
    await expect(deleteTenant(w.db, w.ctx.manager, c.tenantId)).rejects.toMatchObject({ code: "tenant_has_records" });
    expect(await w.db.select().from(s.tenants).where(eq(s.tenants.id, c.tenantId))).toHaveLength(1);
  });
});

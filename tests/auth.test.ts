import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import * as s from "@/db/schema";
import {
  activateTenant,
  createSession,
  requestTenantOtp,
  resetTenantPassword,
  resolveSession,
  revokeSession,
  staffLogin,
  tenantLogin,
  verifyOtp,
} from "@/domain/auth";
import { signupOrganisation } from "@/domain/organisation";
import { DEMO_OTP } from "@/lib/demo";
import { verifyPassword } from "@/lib/password";
import { buildWorld, type World } from "./fixtures";

let w: World;
beforeAll(async () => {
  w = await buildWorld();
});

describe("fixed demo OTP (123456)", () => {
  it("is defined in exactly one place", () => {
    expect(DEMO_OTP).toBe("123456");
  });

  it("activates a tenant that the office created", async () => {
    const [nasra] = await w.db.select().from(s.tenants).where(and(eq(s.tenants.orgId, w.orgId), eq(s.tenants.idNumber, "87654321")));
    expect(nasra.activatedAt).toBeNull();
    await requestTenantOtp(w.db, { idNumber: "87654321", purpose: "tenant_activation" });
    const sent = await w.db.select().from(s.notifications).where(and(eq(s.notifications.recipientId, nasra.id), eq(s.notifications.template, "otp_activation")));
    expect(sent).toHaveLength(1);
    expect(sent[0].channel).toBe("sms"); // OTP always goes by SMS first (proposal 2.3.3)

    await expect(activateTenant(w.db, { idNumber: "87654321", code: "000000", password: "Strong-Pass-2026" })).rejects.toMatchObject({ code: "otp_invalid" });
    await expect(activateTenant(w.db, { idNumber: "87654321", code: DEMO_OTP, password: "short" })).rejects.toMatchObject({ code: "password_too_short" });
    const res = await activateTenant(w.db, { idNumber: "87654321", code: DEMO_OTP, password: "Strong-Pass-2026" });
    expect(res.token.length).toBeGreaterThan(20);
    const [after] = await w.db.select().from(s.tenants).where(eq(s.tenants.id, nasra.id));
    expect(after.activatedAt).not.toBeNull();
    expect(await verifyPassword("Strong-Pass-2026", after.passwordHash)).toBe(true);
  });

  it("is single use and limited to three attempts", async () => {
    const [t] = await w.db.select().from(s.tenants).where(and(eq(s.tenants.orgId, w.orgId), eq(s.tenants.idNumber, "12345678")));
    await requestTenantOtp(w.db, { idNumber: "12345678", purpose: "tenant_reset" });
    for (let i = 0; i < 3; i++) {
      await expect(verifyOtp(w.db, { purpose: "tenant_reset", subjectId: t.id, code: "111111" })).rejects.toBeTruthy();
    }
    await expect(verifyOtp(w.db, { purpose: "tenant_reset", subjectId: t.id, code: DEMO_OTP })).rejects.toMatchObject({ code: "otp_attempts" });
    await requestTenantOtp(w.db, { idNumber: "12345678", purpose: "tenant_reset" });
    await verifyOtp(w.db, { purpose: "tenant_reset", subjectId: t.id, code: DEMO_OTP });
    await expect(verifyOtp(w.db, { purpose: "tenant_reset", subjectId: t.id, code: DEMO_OTP })).rejects.toBeTruthy();
  });

  it("resets a forgotten password and signs the tenant out everywhere", async () => {
    const [t] = await w.db.select().from(s.tenants).where(and(eq(s.tenants.orgId, w.orgId), eq(s.tenants.idNumber, "10311562")));
    const live = await createSession(w.db, { kind: "tenant", tenantId: t.id, orgId: w.orgId });
    expect(await resolveSession(w.db, live.token)).not.toBeNull();
    await requestTenantOtp(w.db, { idNumber: "10311562", purpose: "tenant_reset" });
    await resetTenantPassword(w.db, { idNumber: "10311562", code: DEMO_OTP, password: "Brand-New-Pass-77" });
    expect(await resolveSession(w.db, live.token)).toBeNull();
    const login = await tenantLogin(w.db, { idNumber: "10311562", password: "Brand-New-Pass-77" });
    expect(login.tenantId).toBe(t.id);
  });
});

describe("login security (CR-12.5)", () => {
  it("a failed login reveals nothing about whether the ID exists", async () => {
    const wrongPassword = await tenantLogin(w.db, { idNumber: "11416589", password: "not-the-password-1" }).catch((e) => e);
    const unknownId = await tenantLogin(w.db, { idNumber: "00000000", password: "not-the-password-1" }).catch((e) => e);
    expect(wrongPassword.code).toBe("invalid_credentials");
    expect(unknownId.code).toBe("invalid_credentials");
    expect(wrongPassword.message).toBe(unknownId.message);
    const staffUnknown = await staffLogin(w.db, { email: "ghost@nowhere.example", password: "whatever-123" }).catch((e) => e);
    expect(staffUnknown.code).toBe("invalid_credentials");
  });

  it("locks the account after five failures, even for the right password", async () => {
    for (let i = 0; i < 5; i++) {
      await tenantLogin(w.db, { idNumber: "11638955", password: "wrong-password-1" }).catch(() => null);
    }
    await expect(tenantLogin(w.db, { idNumber: "11638955", password: "Ijara-Demo-2026" })).rejects.toMatchObject({ code: "too_many_attempts" });
  });

  it("failed logins are written to the elevated audit class", async () => {
    const rows = await w.db.select().from(s.auditLog).where(eq(s.auditLog.action, "auth.failed_login"));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.elevated)).toBe(true);
  });

  it("staff sign in, resolve and sign out; suspended offices are refused", async () => {
    const res = await staffLogin(w.db, { email: "Manager@AlSahil.demo", password: "Ijara-Demo-2026" });
    const session = await resolveSession(w.db, res.token);
    expect(session?.kind).toBe("staff");
    if (session?.kind === "staff") expect(session.user.role).toBe("manager");
    await revokeSession(w.db, res.token);
    expect(await resolveSession(w.db, res.token)).toBeNull();

    await w.db.update(s.organisations).set({ status: "suspended" }).where(eq(s.organisations.id, w.orgBId));
    await expect(staffLogin(w.db, { email: "manager@muscatgate.demo", password: "Ijara-Demo-2026" })).rejects.toMatchObject({ code: "org_suspended" });
    await w.db.update(s.organisations).set({ status: "active" }).where(eq(s.organisations.id, w.orgBId));
  });

  it("a tenant session never resolves to a staff session and vice versa", async () => {
    const [t] = await w.db.select().from(s.tenants).where(and(eq(s.tenants.orgId, w.orgId), eq(s.tenants.idNumber, "12345678")));
    const ts = await createSession(w.db, { kind: "tenant", tenantId: t.id, orgId: w.orgId });
    expect((await resolveSession(w.db, ts.token))?.kind).toBe("tenant");
  });
});

describe("organisation signup (section 7)", () => {
  it("creates the office, its first manager and default configuration", async () => {
    const { org, user } = await signupOrganisation(w.db, {
      orgName: "Dhofar Letting Office",
      adminName: "Ahmed Al Mashani",
      email: "ahmed@dhofar-letting.example",
      phone: "9955 1234",
      password: "Sturdy-Pass-2026",
      locale: "ar",
    });
    expect(user.role).toBe("manager");
    expect(user.orgId).toBe(org.id);
    const cats = await w.db.select().from(s.maintenanceCategories).where(eq(s.maintenanceCategories.orgId, org.id));
    expect(cats.map((c) => c.key)).toEqual(expect.arrayContaining(["ac", "plumbing", "electrical", "carpentry", "civil"]));
    expect(org.defaultLocale).toBe("ar");
    await expect(
      signupOrganisation(w.db, { orgName: "Dup", adminName: "Dup Admin", email: "ahmed@dhofar-letting.example", phone: "9955 1235", password: "Sturdy-Pass-2026", locale: "en" }),
    ).rejects.toMatchObject({ code: "email_taken" });
    await expect(
      signupOrganisation(w.db, { orgName: "Weak", adminName: "Weak Admin", email: "weak@example.om", phone: "9955 1236", password: "abc", locale: "en" }),
    ).rejects.toMatchObject({ code: "password_too_short" });
  });
});

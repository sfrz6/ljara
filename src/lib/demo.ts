/**
 * Central demo configuration. This is the ONLY place the fixed validation OTP lives.
 * A production implementation replaces verifyOtpCode (src/domain/otp.ts) with real SMS delivered codes.
 */

export const DEMO_OTP = "123456";

export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "true";
}

export const DEMO_PASSWORD = "Ijara-Demo-2026";

export interface DemoAccount {
  key: string;
  kind: "staff" | "tenant";
  roleKey: "platform_admin" | "manager" | "accounts" | "maintenance" | "contracts" | "tenant";
  identifier: string; // email for staff, ID card number for tenants
  password: string;
  name: string;
}

export const DEMO_ACCOUNTS: DemoAccount[] = [
  { key: "platform", kind: "staff", roleKey: "platform_admin", identifier: "platform@ijara.demo", password: DEMO_PASSWORD, name: "Platform Administrator" },
  { key: "manager", kind: "staff", roleKey: "manager", identifier: "manager@alsahil.demo", password: DEMO_PASSWORD, name: "Khalid Al Rawahi" },
  { key: "accounts", kind: "staff", roleKey: "accounts", identifier: "accounts@alsahil.demo", password: DEMO_PASSWORD, name: "Maryam Al Balushi" },
  { key: "maintenance", kind: "staff", roleKey: "maintenance", identifier: "maintenance@alsahil.demo", password: DEMO_PASSWORD, name: "Salim Al Hinai" },
  { key: "contracts", kind: "staff", roleKey: "contracts", identifier: "contracts@alsahil.demo", password: DEMO_PASSWORD, name: "Aisha Al Kindi" },
  { key: "tenant", kind: "tenant", roleKey: "tenant", identifier: "12345678", password: DEMO_PASSWORD, name: "Hamad Al Siyabi" },
];

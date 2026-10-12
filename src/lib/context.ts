import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getDb, type DB } from "@/db/client";
import type { Ctx } from "@/domain/context";
import { can, type Permission, type Role } from "@/domain/permissions";
import type { Locale, Translate } from "@/i18n";
import { getLocale, getSession, getT } from "./session";

export interface StaffContext {
  db: DB;
  ctx: Ctx;
  role: Role;
  user: { id: string; name: string; email: string; orgId: string | null; locale: Locale; twoFactorEnabled: boolean };
  org: { id: string; name: string; nameAr: string | null; defaultLocale: Locale } | null;
  locale: Locale;
  t: Translate;
  can: (p: Permission) => boolean;
}

export interface TenantContext {
  db: DB;
  ctx: Ctx;
  tenant: { id: string; orgId: string; nameEn: string; nameAr: string | null; locale: Locale };
  org: { id: string; name: string; defaultLocale: Locale };
  locale: Locale;
  t: Translate;
}

/** Resolved once per request. Returns null when nobody (or a tenant) is signed in. */
export const getStaff = cache(async (): Promise<StaffContext | null> => {
  const session = await getSession();
  if (!session || session.kind !== "staff" || session.pending2fa) return null;
  const db = await getDb();
  const locale = await getLocale();
  const t = await getT();
  const role = session.user.role;
  return {
    db,
    role,
    ctx: {
      orgId: session.user.orgId ?? "",
      actor: { kind: "user", id: session.user.id, name: session.user.name, role },
    },
    user: session.user,
    org: session.org,
    locale,
    t,
    can: (p) => can(role, p),
  };
});

export const getTenant = cache(async (): Promise<TenantContext | null> => {
  const session = await getSession();
  if (!session || session.kind !== "tenant") return null;
  const db = await getDb();
  const locale = await getLocale();
  const t = await getT();
  return {
    db,
    locale,
    t,
    tenant: session.tenant,
    org: session.org,
    ctx: {
      orgId: session.tenant.orgId,
      actor: { kind: "tenant", id: session.tenant.id, name: session.tenant.nameEn, role: "tenant" },
    },
  };
}) ;

/** Page guard for office staff. Redirects anonymous visitors, sends tenants and platform admins to their own home. */
export async function requireStaff(permission?: Permission): Promise<StaffContext> {
  const staff = await getStaff();
  if (!staff) {
    const session = await getSession();
    if (session?.kind === "tenant") redirect("/portal");
    if (session?.kind === "staff" && session.pending2fa) redirect("/login/verify");
    redirect("/login");
  }
  if (staff.role === "platform_admin") redirect("/platform");
  if (permission && !staff.can(permission)) redirect("/forbidden");
  return staff;
}

export async function requirePlatform(): Promise<StaffContext> {
  const staff = await getStaff();
  if (!staff) redirect("/login");
  if (staff.role !== "platform_admin") redirect("/dashboard");
  return staff;
}

export async function requireTenant(): Promise<TenantContext> {
  const tenant = await getTenant();
  if (!tenant) redirect("/portal/login");
  return tenant;
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { tenants, users } from "@/db/schema";
import { markAllRead } from "@/domain/notifications";
import { revokeSession } from "@/domain/auth";
import { isLocale } from "@/i18n";
import { clearSessionCookie, getSession, getSessionToken, setLocaleCookie } from "@/lib/session";

export async function setLocaleAction(formData: FormData): Promise<void> {
  const locale = String(formData.get("locale") ?? "");
  if (!isLocale(locale)) return;
  await setLocaleCookie(locale);
  const session = await getSession();
  const db = await getDb();
  if (session?.kind === "staff") await db.update(users).set({ locale }).where(eq(users.id, session.user.id));
  if (session?.kind === "tenant") await db.update(tenants).set({ locale }).where(eq(tenants.id, session.tenant.id));
  const back = String(formData.get("back") ?? "");
  revalidatePath("/", "layout");
  if (back.startsWith("/") && !back.startsWith("//")) redirect(back);
}

export async function signOutAction(formData: FormData): Promise<void> {
  const token = await getSessionToken();
  const session = await getSession();
  if (token) {
    const db = await getDb();
    await revokeSession(db, token);
  }
  await clearSessionCookie();
  redirect(session?.kind === "tenant" || formData.get("to") === "portal" ? "/portal/login" : "/login");
}

export async function markNotificationsReadAction(): Promise<void> {
  const session = await getSession();
  if (!session) return;
  const db = await getDb();
  if (session.kind === "staff" && session.user.orgId) await markAllRead(db, session.user.orgId, "user", session.user.id);
  if (session.kind === "tenant") await markAllRead(db, session.tenant.orgId, "tenant", session.tenant.id);
  revalidatePath("/", "layout");
}

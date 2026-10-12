import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { getDb } from "@/db/client";
import { resolveSession, type ResolvedSession } from "@/domain/auth";
import { LOCALE_COOKIE, isLocale, makeT, type Locale, type Translate } from "@/i18n";

export const SESSION_COOKIE = "ijara_session";

const secure = () => process.env.NODE_ENV === "production";

export async function setSessionCookie(token: string, expires: Date): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: secure(),
    sameSite: "lax",
    path: "/",
    expires,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function getSessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

/** Current session (staff or tenant), resolved once per request. */
export const getSession = cache(async (): Promise<ResolvedSession | null> => {
  const token = await getSessionToken();
  if (!token) return null;
  const db = await getDb();
  return resolveSession(db, token);
});

export async function setLocaleCookie(locale: Locale): Promise<void> {
  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    sameSite: "lax",
    secure: secure(),
    maxAge: 60 * 60 * 24 * 365,
  });
}

/** Locale for this request: cookie first, then the signed-in user's preference, then the browser, Arabic by default. */
export const getLocale = cache(async (): Promise<Locale> => {
  const cookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(cookie)) return cookie;
  const session = await getSession();
  if (session?.kind === "staff") return session.user.locale;
  if (session?.kind === "tenant") return session.tenant.locale;
  const accept = (await headers()).get("accept-language") ?? "";
  if (/^\s*en/i.test(accept)) return "en";
  return "ar";
});

export const getT = cache(async (): Promise<Translate> => makeT(await getLocale()));

export async function getBaseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  if (host) return `${proto}://${host}`;
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

export async function getClientMeta() {
  const h = await headers();
  return { userAgent: h.get("user-agent"), ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null };
}

import { en } from "./en";
import { ar } from "./ar";

export type Locale = "en" | "ar";
export type Dict = typeof en;
export type Key = keyof Dict;

export const LOCALES: Locale[] = ["en", "ar"];
export const LOCALE_COOKIE = "ijara_locale";

export const dictionaries: Record<Locale, Record<Key, string>> = { en, ar };

export const dirOf = (locale: Locale) => (locale === "ar" ? "rtl" : "ltr");

export function isLocale(v: string | undefined | null): v is Locale {
  return v === "en" || v === "ar";
}

export type Translate = (key: Key, params?: Record<string, string | number>) => string;

export function makeT(locale: Locale): Translate {
  const dict = dictionaries[locale];
  return (key, params) => {
    const raw = dict[key] ?? en[key] ?? key;
    if (!params) return raw;
    return raw.replace(/\{(\w+)\}/g, (_, k: string) => (k in params ? String(params[k]) : `{${k}}`));
  };
}

/** Translate a domain error code (err.<code>) with a safe fallback. */
export function errorMessage(t: Translate, code: string, params?: Record<string, string | number>): string {
  const key = `err.${code}` as Key;
  return key in en ? t(key, params) : t("err.generic");
}

/** Pick the Arabic variant of a bilingual business name when the UI is Arabic and one exists. */
export function pickName(locale: Locale, en: string | null | undefined, ar: string | null | undefined): string {
  if (locale === "ar") return (ar && ar.trim()) || en || "";
  return en || ar || "";
}

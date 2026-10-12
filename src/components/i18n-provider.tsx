"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { dirOf, makeT, type Locale, type Translate } from "@/i18n";

interface I18n {
  locale: Locale;
  dir: "ltr" | "rtl";
  t: Translate;
}

const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const value = useMemo<I18n>(() => ({ locale, dir: dirOf(locale), t: makeT(locale) }), [locale]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) return { locale: "en", dir: "ltr", t: makeT("en") };
  return v;
}


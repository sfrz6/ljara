import { Languages } from "lucide-react";
import { setLocaleAction } from "@/app/actions/common";
import type { Locale } from "@/i18n";

/** One tap switch between Arabic and English; sets the cookie and the user's saved preference. */
export function LanguageSwitch({ locale, back = "", className }: { locale: Locale; back?: string; className?: string }) {
  const next: Locale = locale === "ar" ? "en" : "ar";
  return (
    <form action={setLocaleAction} className={className}>
      <input type="hidden" name="locale" value={next} />
      <input type="hidden" name="back" value={back} />
      <button type="submit" lang={next} className="inline-flex h-10 items-center gap-2 rounded-sm px-3 text-[14px] font-medium text-ink-2 hover:bg-black/5 md:h-9">
        <Languages className="size-4" aria-hidden />
        {next === "ar" ? "العربية" : "English"}
      </button>
    </form>
  );
}

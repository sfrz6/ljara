import type { ReactNode } from "react";
import { Wordmark } from "./brand";
import { LanguageSwitch } from "./language-switch";
import type { Locale } from "@/i18n";

export function AuthShell({ locale, title, subtitle, children, footer }: { locale: Locale; title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="pt-safe pb-safe flex min-h-dvh flex-col bg-canvas">
      <div className="flex items-center justify-between px-4 py-4 md:px-8">
        <Wordmark locale={locale} />
        <LanguageSwitch locale={locale} />
      </div>
      <div className="flex flex-1 items-start justify-center px-4 pb-10 md:items-center">
        <div className="w-full max-w-md">
          <div className="rounded-lg border border-line bg-surface p-5 shadow-card md:p-7">
            <h1 className="text-[21px] font-semibold tracking-tight text-ink">{title}</h1>
            {subtitle ? <p className="mt-1 text-[14px] text-ink-2">{subtitle}</p> : null}
            <div className="mt-5">{children}</div>
          </div>
          {footer ? <div className="mt-4 text-center text-[14px] text-ink-2">{footer}</div> : null}
        </div>
      </div>
    </main>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Download, PlusSquare, Share, X } from "lucide-react";
import { Button } from "./ui/button";
import { useI18n } from "./i18n-provider";
import { LogoMark } from "./brand";

const DISMISS_KEY = "ijara_install_dismissed";
const VISITS_KEY = "ijara_visits";
const SNOOZE_MS = 1000 * 60 * 60 * 24 * 30;

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode */
  }
}

/**
 * Registers the service worker and, at most once a month and only from the second visit, offers installation.
 * iOS Safari has no install API, so we show a short instruction instead of a fake Install button.
 */
export function PwaRuntime() {
  const { t } = useI18n();
  const [mode, setMode] = useState<"none" | "ios" | "android">("none");
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    }
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;

    let visits = Number(safeGet(VISITS_KEY) ?? "0");
    try {
      if (!sessionStorage.getItem("ijara_session_counted")) {
        sessionStorage.setItem("ijara_session_counted", "1");
        visits += 1;
        safeSet(VISITS_KEY, String(visits));
      }
    } catch {
      /* private mode */
    }
    const dismissedAt = Number(safeGet(DISMISS_KEY) ?? "0");
    const snoozed = Date.now() - dismissedAt < SNOOZE_MS;
    if (visits < 2 || snoozed) return;

    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && "ontouchend" in document);
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
    if (isIOS && isSafari) {
      setMode("ios");
      return;
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setMode("android");
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  function dismiss() {
    safeSet(DISMISS_KEY, String(Date.now()));
    setMode("none");
  }

  if (mode === "none") return null;
  return (
    <div className="pb-safe fixed inset-x-0 bottom-0 z-40 px-3 pb-3 md:inset-x-auto md:end-4 md:bottom-4 md:max-w-sm md:p-0" role="dialog" aria-label={t("pwa.title")}>
      <div className="mb-[calc(var(--safe-bottom)+4.5rem)] rounded-lg border border-line bg-surface p-4 shadow-pop md:mb-0">
        <div className="flex items-start gap-3">
          <LogoMark className="size-10 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold text-ink">{t("pwa.title")}</p>
            {mode === "ios" ? (
              <ol className="mt-1.5 space-y-1.5 text-[13.5px] text-ink-2">
                <li className="flex items-center gap-2">
                  <Share className="size-4 shrink-0 text-info-600" aria-hidden />
                  <span>{t("pwa.ios_step1")}</span>
                </li>
                <li className="flex items-center gap-2">
                  <PlusSquare className="size-4 shrink-0 text-info-600" aria-hidden />
                  <span>{t("pwa.ios_step2")}</span>
                </li>
              </ol>
            ) : (
              <p className="mt-1 text-[13.5px] text-ink-2">{t("pwa.android_body")}</p>
            )}
            {mode === "android" ? (
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  onClick={async () => {
                    await deferred?.prompt();
                    dismiss();
                  }}
                >
                  <Download className="size-4" aria-hidden />
                  {t("pwa.install")}
                </Button>
                <Button size="sm" variant="ghost" onClick={dismiss}>
                  {t("pwa.not_now")}
                </Button>
              </div>
            ) : null}
          </div>
          <button type="button" onClick={dismiss} className="-m-1 rounded-sm p-1 text-ink-3 hover:text-ink" aria-label={t("common.close")}>
            <X className="size-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Toaster, toast } from "sonner";
import { useI18n } from "./i18n-provider";
import type { Key } from "@/i18n";

/** Toasts sit at the top on phones (clear of the virtual keyboard and bottom nav) and bottom-end on desktop. */
export function AppToaster({ dir }: { dir: "ltr" | "rtl" }) {
  return (
    <Toaster
      dir={dir}
      position="top-center"
      offset={{ top: "calc(var(--safe-top) + 12px)" }}
      mobileOffset={{ top: "calc(var(--safe-top) + 8px)" }}
      closeButton
      toastOptions={{
        classNames: {
          toast: "!rounded-md !border !border-line !font-sans !text-[14px] !shadow-pop",
          success: "!text-ok-700",
          error: "!text-bad-700",
        },
      }}
    />
  );
}

/** Reads the one-shot flash cookie set by a server action before a redirect and shows it as a toast. */
export function FlashToaster() {
  const { t } = useI18n();
  const pathname = usePathname();
  useEffect(() => {
    const match = document.cookie.split("; ").find((c) => c.startsWith("ijara_flash="));
    if (!match) return;
    const key = decodeURIComponent(match.split("=")[1]) as Key;
    document.cookie = "ijara_flash=; Max-Age=0; path=/";
    toast.success(t(key));
  }, [t, pathname]);
  return null;
}

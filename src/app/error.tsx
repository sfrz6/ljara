"use client";

import { TriangleAlert } from "lucide-react";
import { EmptyState } from "@/components/ui/display";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/i18n-provider";

/** Last resort screen for an unexpected failure. Shows a reference so support can find the log line. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg items-center px-4">
      <EmptyState
        className="w-full"
        icon={<TriangleAlert className="size-5" />}
        title={t("err.generic")}
        description={error.digest ? `${t("err.reference")}: ${error.digest}` : undefined}
        action={<Button onClick={reset}>{t("err.try_again")}</Button>}
      />
    </main>
  );
}

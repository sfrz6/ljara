"use client";

import { useState } from "react";
import { KeyRound, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { ActionForm, Alert, SubmitButton, type FormAction } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/overlays";
import { useI18n } from "@/components/i18n-provider";

/**
 * Generates a one-time code for a tenant and shows it once. The office reads it to the tenant by phone or hands it
 * over in person, so activation and password reset work even while SMS delivery is not connected.
 */
export function ManualCodeButton({ action, tenantId, activated }: { action: FormAction; tenantId: string; activated: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [hours, setHours] = useState(24);
  const [copied, setCopied] = useState(false);

  function close(o: boolean) {
    setOpen(o);
    if (!o) {
      setCode(null);
      setCopied(false);
    }
  }

  return (
    <>
      <Button variant="secondary" size="md" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <KeyRound className="size-4" aria-hidden />
        {activated ? t("tenant.manual_reset") : t("tenant.manual_code")}
      </Button>
      <Modal open={open} onOpenChange={close} title={activated ? t("tenant.manual_reset") : t("tenant.manual_code")} description={t("tenant.manual_code_hint")} size="sm">
        {code ? (
          <div className="space-y-4">
            <div className="rounded-md border border-line bg-canvas px-4 py-5 text-center">
              <p className="text-[12.5px] text-ink-3">{t("tenant.manual_code_shown")}</p>
              <p className="mt-1 font-mono text-[32px] font-semibold tracking-[0.25em]" dir="ltr">{code}</p>
              <p className="mt-1 text-[12.5px] text-ink-3">{t("tenant.manual_code_valid", { hours: String(hours) })}</p>
            </div>
            <Alert tone="warn">{t("tenant.manual_code_once")}</Alert>
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(code);
                    setCopied(true);
                  } catch {
                    toast.error(t("err.generic"));
                  }
                }}
              >
                {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                {t("common.copy")}
              </Button>
              <Button onClick={() => close(false)}>{t("common.close")}</Button>
            </div>
          </div>
        ) : (
          <ActionForm
            action={action}
            silent
            onSuccess={(s) => {
              const d = s.data as { code?: string; validHours?: number } | undefined;
              if (d?.code) {
                setCode(d.code);
                setHours(d.validHours ?? 24);
              }
            }}
          >
            <input type="hidden" name="id" value={tenantId} />
            <SubmitButton className="w-full" size="md">{t("tenant.manual_generate")}</SubmitButton>
          </ActionForm>
        )}
      </Modal>
    </>
  );
}

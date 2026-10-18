"use client";

import { useState } from "react";
import { Check, Copy, MessageCircle, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { ActionForm, Alert, SubmitButton, type FormAction } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/overlays";
import { useI18n } from "@/components/i18n-provider";

interface Login {
  idNumber: string;
  password: string;
  url: string;
  name: string;
}

/**
 * Creates the tenant's portal login immediately and shows the ID number and password once, with a ready message to
 * copy or send by WhatsApp. The tenant can change the password from their profile.
 */
export function TenantLoginButton({ action, tenantId, hasLogin, phone }: { action: FormAction; tenantId: string; hasLogin: boolean; phone: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [login, setLogin] = useState<Login | null>(null);
  const [copied, setCopied] = useState(false);

  const message = login ? t("tenant.login_message", { name: login.name, url: login.url, id: login.idNumber, password: login.password }) : "";

  function close(o: boolean) {
    setOpen(o);
    if (!o) {
      setLogin(null);
      setCopied(false);
    }
  }

  return (
    <>
      <Button variant="secondary" size="md" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <UserCheck className="size-4" aria-hidden />
        {hasLogin ? t("tenant.login_new") : t("tenant.login_create")}
      </Button>
      <Modal open={open} onOpenChange={close} title={hasLogin ? t("tenant.login_new") : t("tenant.login_create")} description={t("tenant.login_hint")} size="sm">
        {login ? (
          <div className="space-y-4">
            <dl className="space-y-2 rounded-md border border-line bg-canvas px-4 py-4 text-[14px]">
              <div className="flex justify-between gap-3"><dt className="text-ink-3">{t("auth.id_number")}</dt><dd className="font-mono font-semibold" dir="ltr">{login.idNumber}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-ink-3">{t("auth.password")}</dt><dd className="font-mono font-semibold" dir="ltr">{login.password}</dd></div>
            </dl>
            <Alert tone="warn">{t("tenant.login_once")}</Alert>
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(message);
                    setCopied(true);
                  } catch {
                    toast.error(t("err.generic"));
                  }
                }}
              >
                {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                {t("common.copy")}
              </Button>
              <a
                className="inline-flex h-11 items-center gap-2 rounded-sm bg-brand-700 px-4 text-[14px] font-medium text-white hover:bg-brand-800 md:h-9"
                href={`https://wa.me/${phone.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`}
                target="_blank"
                rel="noreferrer"
              >
                <MessageCircle className="size-4" aria-hidden />
                WhatsApp
              </a>
            </div>
          </div>
        ) : (
          <ActionForm
            action={action}
            silent
            onSuccess={(s) => {
              const d = s.data as Partial<Login> | undefined;
              if (d?.password) setLogin(d as Login);
            }}
          >
            <input type="hidden" name="id" value={tenantId} />
            {hasLogin ? <Alert tone="warn">{t("tenant.login_replace_warn")}</Alert> : null}
            <SubmitButton className="w-full" size="md">{t("tenant.login_generate")}</SubmitButton>
          </ActionForm>
        )}
      </Modal>
    </>
  );
}

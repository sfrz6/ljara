"use client";

import { useActionState, useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { ActionForm, Alert, Field, Input, SubmitButton, useFormState } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { OtpInput } from "@/components/otp-input";
import { useI18n } from "@/components/i18n-provider";
import { activateAction, requestOtpAction, resetPasswordAction } from "@/app/actions/portal";

const RESEND_SECONDS = 30;

function Resend({ idNumber, purpose }: { idNumber: string; purpose: "tenant_activation" | "tenant_reset" }) {
  const { t } = useI18n();
  const [left, setLeft] = useState(RESEND_SECONDS);
  const [state, action, pending] = useActionState(requestOtpAction, null);
  useEffect(() => {
    const id = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (state?.ok) setLeft(RESEND_SECONDS);
  }, [state]);
  return (
    <form action={action} className="text-center">
      <input type="hidden" name="idNumber" value={idNumber} />
      <input type="hidden" name="purpose" value={purpose} />
      <Button type="submit" variant="ghost" size="sm" disabled={left > 0 || pending}>
        {left > 0 ? t("portal.resend_in", { s: left }) : t("portal.resend")}
      </Button>
    </form>
  );
}

function CodeStepFields({ mode }: { mode: "activate" | "reset" }) {
  const { t } = useI18n();
  const { state } = useFormState();
  return (
    <>
      <div>
        <p className="mb-2 text-center text-[13.5px] text-ink-2">{t("portal.code_hint")}</p>
        <OtpInput invalid={!!state?.error} />
      </div>
      <Field label={mode === "activate" ? t("portal.new_password") : t("portal.new_password")} name="password" hint={t("auth.password_hint")}>
        <Input name="password" type="password" autoComplete="new-password" />
      </Field>
    </>
  );
}

export function OtpFlow({ mode }: { mode: "activate" | "reset" }) {
  const { t } = useI18n();
  const purpose = mode === "activate" ? "tenant_activation" : "tenant_reset";
  const [idNumber, setIdNumber] = useState("");
  const [sent, setSent] = useState(false);
  return (
    <div className="space-y-4">
      {!sent ? (
        <ActionForm action={requestOtpAction} onSuccess={() => setSent(true)} silent>
          <input type="hidden" name="purpose" value={purpose} />
          <Field label={t("auth.id_number")} name="idNumber" required><Input name="idNumber" value={idNumber} onChange={(e) => setIdNumber(e.target.value)} autoComplete="username" /></Field>
          <p className="text-[13px] text-ink-3">{t("portal.otp_sms_hint")}</p>
          <SubmitButton size="lg" className="w-full" pendingLabel={t("common.loading")}>{t("portal.send_code")}</SubmitButton>
        </ActionForm>
      ) : (
        <>
          <Alert tone="ok"><span className="flex items-center gap-2"><ShieldCheck className="size-4" aria-hidden />{t("portal.code_sent")}</span></Alert>
          <ActionForm action={mode === "activate" ? activateAction : resetPasswordAction}>
            <input type="hidden" name="idNumber" value={idNumber} />
            <CodeStepFields mode={mode} />
            <SubmitButton size="lg" className="w-full">{mode === "activate" ? t("portal.activate") : t("portal.reset")}</SubmitButton>
          </ActionForm>
          <Resend idNumber={idNumber} purpose={purpose} />
          <Button variant="ghost" size="sm" className="w-full" onClick={() => setSent(false)}>{t("portal.change_id")}</Button>
        </>
      )}
    </div>
  );
}

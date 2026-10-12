"use client";

import { useState } from "react";
import { ActionForm, Alert, Field, Input, SubmitButton } from "@/components/ui/form";
import { OtpInput } from "@/components/otp-input";
import { useI18n } from "@/components/i18n-provider";
import { requestStaffResetAction, resetStaffAction } from "@/app/actions/auth";

export function StaffResetFlow() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  return sent ? (
    <div className="space-y-4">
      <Alert tone="ok">{t("portal.code_sent")}</Alert>
      <ActionForm action={resetStaffAction}>
        <input type="hidden" name="email" value={email} />
        <OtpInput />
        <Field label={t("portal.new_password")} name="password" hint={t("auth.password_hint")}><Input name="password" type="password" autoComplete="new-password" /></Field>
        <SubmitButton size="lg" className="w-full">{t("portal.reset")}</SubmitButton>
      </ActionForm>
    </div>
  ) : (
    <ActionForm action={requestStaffResetAction} onSuccess={() => setSent(true)} silent>
      <Field label={t("auth.email")} name="email"><Input name="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" /></Field>
      <SubmitButton size="lg" className="w-full">{t("portal.send_code")}</SubmitButton>
    </ActionForm>
  );
}

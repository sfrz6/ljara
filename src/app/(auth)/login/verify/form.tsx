"use client";

import { ActionForm, SubmitButton } from "@/components/ui/form";
import { OtpInput } from "@/components/otp-input";
import { useI18n } from "@/components/i18n-provider";
import { verify2faAction } from "@/app/actions/auth";

export function VerifyForm() {
  const { t } = useI18n();
  return (
    <ActionForm action={verify2faAction}>
      <OtpInput />
      <SubmitButton size="lg" className="w-full">{t("common.continue")}</SubmitButton>
    </ActionForm>
  );
}

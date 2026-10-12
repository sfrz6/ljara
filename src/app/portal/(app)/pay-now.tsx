"use client";

import { CreditCard } from "lucide-react";
import { ActionForm, SubmitButton } from "@/components/ui/form";
import { useI18n } from "@/components/i18n-provider";
import { payNowAction } from "@/app/actions/portal";

export function PayNowButton({ itemId }: { itemId: string }) {
  const { t } = useI18n();
  return (
    <ActionForm action={payNowAction} className="space-y-0">
      <input type="hidden" name="itemId" value={itemId} />
      <SubmitButton size="lg" variant="accent" className="w-full" pendingLabel={t("common.loading")}><CreditCard className="size-5" aria-hidden />{t("portal.pay_now")}</SubmitButton>
    </ActionForm>
  );
}

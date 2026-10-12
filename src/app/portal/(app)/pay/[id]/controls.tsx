"use client";

import { Check, X } from "lucide-react";
import { ActionForm, Alert, SubmitButton } from "@/components/ui/form";
import { useI18n } from "@/components/i18n-provider";
import { gatewayAction } from "@/app/actions/portal";

export function GatewayControls({ intentId }: { intentId: string }) {
  const { t } = useI18n();
  return (
    <div className="space-y-3 rounded-md border border-dashed border-brass-500 bg-brass-50 p-3.5">
      <p className="text-[12px] font-semibold uppercase tracking-wide text-brass-700">{t("portal.demo_controls")}</p>
      <Alert tone="info">{t("portal.demo_gateway_hint")}</Alert>
      <ActionForm action={gatewayAction} className="space-y-0" hideBanner>
        <input type="hidden" name="intentId" value={intentId} />
        <input type="hidden" name="outcome" value="success" />
        <SubmitButton size="lg" className="w-full" pendingLabel={t("common.loading")}><Check className="size-5" aria-hidden />{t("portal.simulate_success")}</SubmitButton>
      </ActionForm>
      <ActionForm action={gatewayAction} className="space-y-0" hideBanner>
        <input type="hidden" name="intentId" value={intentId} />
        <input type="hidden" name="outcome" value="failure" />
        <input type="hidden" name="reason" value="card_declined" />
        <SubmitButton size="lg" variant="secondary" className="w-full" pendingLabel={t("common.loading")}><X className="size-5" aria-hidden />{t("portal.simulate_failure")}</SubmitButton>
      </ActionForm>
    </div>
  );
}

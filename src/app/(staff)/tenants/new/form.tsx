"use client";

import { ActionForm, FormActions, SubmitButton } from "@/components/ui/form";
import { useI18n } from "@/components/i18n-provider";
import { createTenantAction } from "@/app/actions/portfolio";
import { TenantFields } from "../tenant-fields";

export function NewTenantForm({ next }: { next?: string }) {
  const { t } = useI18n();
  return (
    <ActionForm action={createTenantAction} encType="multipart/form-data">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <TenantFields />
      <FormActions><SubmitButton>{t("tenant.add")}</SubmitButton></FormActions>
    </ActionForm>
  );
}

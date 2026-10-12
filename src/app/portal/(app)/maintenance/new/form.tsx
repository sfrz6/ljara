"use client";

import { ActionForm, Field, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { PhotoPicker } from "@/components/ui/file-input";
import { useI18n } from "@/components/i18n-provider";
import { submitTenantRequestAction } from "@/app/actions/maintenance";

export function TenantRequestForm({ categories }: { categories: { id: string; label: string }[] }) {
  const { t } = useI18n();
  return (
    <ActionForm action={submitTenantRequestAction} encType="multipart/form-data">
      <Field label={t("maint.title")} name="title" required><Input name="title" placeholder={t("portal.title_ph")} /></Field>
      <Field label={t("maint.description")} name="description" required><Textarea name="description" rows={4} /></Field>
      <Field label={t("maint.category")} name="categoryId" optional><Select name="categoryId" defaultValue=""><option value="">{t("common.select_placeholder")}</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select></Field>
      <Field label={t("maint.priority")} name="priority"><Select name="priority" defaultValue="normal"><option value="normal">{t("priority.normal")}</option><option value="urgent">{t("priority.urgent")}</option></Select></Field>
      <PhotoPicker />
      <SubmitButton size="lg" className="w-full">{t("maint.submit")}</SubmitButton>
    </ActionForm>
  );
}

"use client";

import { Checkbox, Field, FormGrid, Input, Select, Textarea } from "@/components/ui/form";
import { DocumentPicker } from "@/components/ui/file-input";
import { useI18n } from "@/components/i18n-provider";

export interface TenantDefaults {
  nameEn?: string;
  nameAr?: string | null;
  phone?: string;
  email?: string | null;
  idNumber?: string;
  locale?: string;
  internalNotes?: string | null;
}

export function TenantFields({ d = {}, edit }: { d?: TenantDefaults; edit?: boolean }) {
  const { t, locale } = useI18n();
  return (
    <>
      <FormGrid>
        <Field label={t("owner.name_en")} name="nameEn" required><Input name="nameEn" defaultValue={d.nameEn} autoComplete="off" /></Field>
        <Field label={t("owner.name_ar")} name="nameAr" optional><Input name="nameAr" dir="rtl" defaultValue={d.nameAr ?? ""} /></Field>
        <Field label={t("common.phone")} name="phone" hint={t("tenant.phone_hint")} required><Input name="phone" type="tel" defaultValue={d.phone} placeholder="9123 4567" /></Field>
        <Field label={t("common.email")} name="email" optional><Input name="email" type="email" defaultValue={d.email ?? ""} /></Field>
        <Field label={t("tenant.id_number")} name="idNumber" hint={edit ? undefined : t("tenant.id_hint")} required>
          <Input name="idNumber" defaultValue={d.idNumber} readOnly={edit} inputMode="text" autoComplete="off" />
        </Field>
        <Field label={t("tenant.language")} name="locale">
          <Select name="locale" defaultValue={d.locale ?? locale}><option value="ar">{t("common.arabic")}</option><option value="en">{t("common.english")}</option></Select>
        </Field>
      </FormGrid>
      <DocumentPicker name="idDoc" label={t("tenant.id_doc")} />
      <Field label={t("tenant.internal_notes")} name="internalNotes" hint={t("tenant.internal_hint")} optional><Textarea name="internalNotes" rows={2} defaultValue={d.internalNotes ?? ""} /></Field>
      {!edit ? <Checkbox name="consent" label={t("tenant.consent")} /> : null}
    </>
  );
}

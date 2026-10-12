"use client";

import { ActionForm, Field, FormGrid, Input, Select, SubmitButton } from "@/components/ui/form";
import { useI18n } from "@/components/i18n-provider";
import { signupAction } from "@/app/actions/auth";
import type { Locale } from "@/i18n";

export function SignupForm({ locale }: { locale: Locale }) {
  const { t } = useI18n();
  return (
    <ActionForm action={signupAction}>
      <Field label={t("auth.org_name")} name="orgName" required>
        <Input name="orgName" autoComplete="organization" />
      </Field>
      <Field label={t("auth.org_name_ar")} name="orgNameAr" optional>
        <Input name="orgNameAr" dir="rtl" />
      </Field>
      <Field label={t("auth.admin_name")} name="adminName" required>
        <Input name="adminName" autoComplete="name" />
      </Field>
      <FormGrid>
        <Field label={t("auth.email")} name="email" required>
          <Input name="email" type="email" autoComplete="email" />
        </Field>
        <Field label={t("auth.phone")} name="phone" required>
          <Input name="phone" type="tel" autoComplete="tel" placeholder="9123 4567" />
        </Field>
      </FormGrid>
      <Field label={t("auth.password")} name="password" hint={t("auth.password_hint")} required>
        <Input name="password" type="password" autoComplete="new-password" />
      </Field>
      <Field label={t("common.language")} name="locale">
        <Select name="locale" defaultValue={locale}>
          <option value="ar">{t("common.arabic")}</option>
          <option value="en">{t("common.english")}</option>
        </Select>
      </Field>
      <SubmitButton className="w-full" size="lg">
        {t("auth.create")}
      </SubmitButton>
    </ActionForm>
  );
}

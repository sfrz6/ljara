"use client";

import { ActionForm, Field, Input, SubmitButton, type FormAction } from "@/components/ui/form";
import { Card, CardBody, CardHeader } from "@/components/ui/display";
import { useI18n } from "@/components/i18n-provider";

/** Change your own password. Other devices are signed out when it succeeds. */
export function ChangePasswordCard({ action }: { action: FormAction }) {
  const { t } = useI18n();
  return (
    <Card>
      <CardHeader title={t("account.change_password")} description={t("account.change_password_hint")} />
      <CardBody>
        <ActionForm action={action} className="space-y-4">
          <Field label={t("account.current_password")} name="current" required>
            <Input name="current" type="password" autoComplete="current-password" />
          </Field>
          <Field label={t("account.new_password")} name="next" hint={t("auth.password_hint")} required>
            <Input name="next" type="password" autoComplete="new-password" />
          </Field>
          <SubmitButton size="md">{t("account.change_password")}</SubmitButton>
        </ActionForm>
      </CardBody>
    </Card>
  );
}

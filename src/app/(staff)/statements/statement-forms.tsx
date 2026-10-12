"use client";

import { useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/display";
import { ActionForm, Field, FormGrid, Input, Select, SubmitButton } from "@/components/ui/form";
import { useI18n } from "@/components/i18n-provider";
import { generateAllStatementsAction, generateStatementAction } from "@/app/actions/finance";
import type { Locale } from "@/i18n";

export function StatementForms({ owners, defaultLocale }: { owners: { id: string; name: string; from: string; to: string; frequency: string }[]; defaultLocale: Locale }) {
  const { t } = useI18n();
  const [ownerId, setOwnerId] = useState(owners[0]?.id ?? "");
  const sel = owners.find((o) => o.id === ownerId);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const f = from ?? sel?.from ?? "";
  const tt = to ?? sel?.to ?? "";
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title={t("statement.generate")} description={t("statement.generate_hint")} />
        <CardBody>
          <ActionForm action={generateStatementAction}>
            <Field label={t("common.owner")} name="ownerId" required>
              <Select name="ownerId" value={ownerId} onChange={(e) => { setOwnerId(e.target.value); setFrom(null); setTo(null); }}>
                {owners.map((o) => <option key={o.id} value={o.id}>{o.name} ({t(`freq.${o.frequency}` as never)})</option>)}
              </Select>
            </Field>
            <FormGrid>
              <Field label={t("common.from")} name="from" required><Input name="from" type="date" value={f} onChange={(e) => setFrom(e.target.value)} /></Field>
              <Field label={t("common.to")} name="to" required><Input name="to" type="date" value={tt} onChange={(e) => setTo(e.target.value)} /></Field>
            </FormGrid>
            <Field label={t("statement.language")} name="locale"><Select name="locale" defaultValue={defaultLocale}><option value="ar">{t("common.arabic")}</option><option value="en">{t("common.english")}</option></Select></Field>
            <SubmitButton>{t("statement.generate")}</SubmitButton>
          </ActionForm>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title={t("statement.run_all")} description={t("statement.run_all_hint")} />
        <CardBody>
          <ActionForm action={generateAllStatementsAction}>
            <FormGrid>
              <Field label={t("common.from")} name="from" required><Input name="from" type="date" defaultValue={owners[0]?.from} /></Field>
              <Field label={t("common.to")} name="to" required><Input name="to" type="date" defaultValue={owners[0]?.to} /></Field>
            </FormGrid>
            <Field label={t("statement.language")} name="locale"><Select name="locale" defaultValue={defaultLocale}><option value="ar">{t("common.arabic")}</option><option value="en">{t("common.english")}</option></Select></Field>
            <SubmitButton variant="secondary">{t("statement.run_all")}</SubmitButton>
          </ActionForm>
        </CardBody>
      </Card>
    </div>
  );
}

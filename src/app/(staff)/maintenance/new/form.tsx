"use client";

import { useState } from "react";
import { Card, CardBody } from "@/components/ui/display";
import { ActionForm, Field, FormActions, FormGrid, Input, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { PhotoPicker } from "@/components/ui/file-input";
import { useI18n } from "@/components/i18n-provider";
import { submitStaffRequestAction } from "@/app/actions/maintenance";

export function NewRequestForm({ units, categories, defaultUnit }: { units: { id: string; label: string; tenantId: string | null }[]; categories: { id: string; label: string }[]; defaultUnit?: string }) {
  const { t } = useI18n();
  const [unitId, setUnitId] = useState(defaultUnit ?? "");
  const tenantId = units.find((u) => u.id === unitId)?.tenantId ?? "";
  return (
    <Card>
      <CardBody>
        <ActionForm action={submitStaffRequestAction} encType="multipart/form-data">
          <Field label={t("common.unit")} name="unitId" required>
            <Select name="unitId" value={unitId} onChange={(e) => setUnitId(e.target.value)}>
              <option value="">{t("common.select_placeholder")}</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
            </Select>
          </Field>
          <input type="hidden" name="tenantId" value={tenantId} />
          <Field label={t("maint.title")} name="title" required><Input name="title" /></Field>
          <Field label={t("maint.description")} name="description" required><Textarea name="description" rows={4} /></Field>
          <FormGrid>
            <Field label={t("maint.priority")} name="priority"><Select name="priority" defaultValue="normal"><option value="normal">{t("priority.normal")}</option><option value="urgent">{t("priority.urgent")}</option></Select></Field>
            <Field label={t("maint.category")} name="categoryId" optional><Select name="categoryId" defaultValue=""><option value="">{t("common.select_placeholder")}</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select></Field>
          </FormGrid>
          <PhotoPicker />
          <FormActions><SubmitButton>{t("maint.submit")}</SubmitButton></FormActions>
        </ActionForm>
      </CardBody>
    </Card>
  );
}

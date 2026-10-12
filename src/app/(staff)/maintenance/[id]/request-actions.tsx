"use client";

import { Card, CardBody, CardHeader } from "@/components/ui/display";
import { ActionForm, Field, FormActions, FormGrid, Input, MoneyInput, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { PhotoPicker } from "@/components/ui/file-input";
import { ActionDialog } from "@/components/ui/overlays";
import { QuickAction } from "@/components/ui/quick-action";
import { useI18n } from "@/components/i18n-provider";
import { assignAction, completeAction, correctCostAction, costAction, noteAction, seenAction, startAction } from "@/app/actions/maintenance";

export function RequestActions({ id, status, isManager, canWork, canCorrect, technicians, categories, defaultCategory }: {
  id: string; status: string; isManager: boolean; canWork: boolean; canCorrect: boolean; technicians: { id: string; name: string }[]; categories: { id: string; label: string }[]; defaultCategory: string;
}) {
  const { t } = useI18n();
  const assignForm = (
    <Field label={t("maint.technician")} name="assigneeId" required>
      <Select name="assigneeId" defaultValue=""><option value="">{t("common.select_placeholder")}</option>{technicians.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>
    </Field>
  );
  return (
    <Card>
      <CardHeader title={t("maint.next_step")} />
      <CardBody className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {isManager && status === "submitted" ? <QuickAction action={seenAction} hidden={{ id }} variant="secondary">{t("maint.act.seen")}</QuickAction> : null}
          {isManager && ["submitted", "seen", "assigned"].includes(status) ? (
            <ActionDialog trigger={status === "assigned" ? t("maint.act.reassign") : t("maint.act.assign")} triggerVariant="primary" title={t("maint.act.assign")} action={assignAction} hidden={{ id }}>{assignForm}</ActionDialog>
          ) : null}
          {canWork && status === "assigned" ? <QuickAction action={startAction} hidden={{ id }}>{t("maint.act.start")}</QuickAction> : null}
          {canWork && ["assigned", "in_progress", "completed", "posted"].includes(status) ? (
            <ActionDialog trigger={t("maint.act.note")} triggerVariant="ghost" title={t("maint.act.note")} description={t("maint.note_hint")} action={noteAction} hidden={{ id }}>
              <Field label={t("common.notes")} name="note" required><Textarea name="note" rows={3} /></Field>
            </ActionDialog>
          ) : null}
          {canCorrect && status === "posted" ? (
            <ActionDialog trigger={t("maint.act.correct_cost")} triggerVariant="secondary" title={t("maint.act.correct_cost")} description={t("maint.correct_hint")} action={correctCostAction} hidden={{ id }}>
              <Field label={t("maint.cost")} name="cost" required><MoneyInput name="cost" /></Field>
              <Field label={t("common.reason")} name="reason" required><Textarea name="reason" rows={2} /></Field>
            </ActionDialog>
          ) : null}
        </div>

        {canWork && status === "in_progress" ? (
          <ActionForm action={completeAction} encType="multipart/form-data" className="space-y-4 border-t border-line pt-4">
            <input type="hidden" name="id" value={id} />
            <h3 className="text-[14px] font-semibold">{t("maint.complete_title")}</h3>
            <Field label={t("maint.category")} name="categoryId" required>
              <Select name="categoryId" defaultValue={defaultCategory}><option value="">{t("common.select_placeholder")}</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select>
            </Field>
            <Field label={t("maint.work")} name="workPerformed" required><Textarea name="workPerformed" rows={3} /></Field>
            <FormGrid>
              <Field label={t("maint.cost")} name="cost" hint={t("maint.cost_hint")}><MoneyInput name="cost" /></Field>
              <Field label={t("common.notes")} name="technicianNotes" optional><Input name="technicianNotes" /></Field>
            </FormGrid>
            <PhotoPicker label={t("maint.work_photos")} />
            <FormActions><SubmitButton>{t("maint.act.complete")}</SubmitButton></FormActions>
          </ActionForm>
        ) : null}

        {canWork && status === "completed" ? (
          <ActionForm action={costAction} className="space-y-4 border-t border-line pt-4">
            <input type="hidden" name="id" value={id} />
            <h3 className="text-[14px] font-semibold">{t("maint.cost_title")}</h3>
            <p className="text-[13.5px] text-ink-2">{t("maint.cost_zero_hint")}</p>
            <Field label={t("maint.cost")} name="cost" required><MoneyInput name="cost" defaultValue="0.000" /></Field>
            <FormActions><SubmitButton>{t("maint.act.log_cost")}</SubmitButton></FormActions>
          </ActionForm>
        ) : null}
        {status === "posted" ? <p className="text-[13.5px] text-ok-700">{t("maint.posted_note")}</p> : null}
      </CardBody>
    </Card>
  );
}

"use client";

import { Card, CardBody, CardHeader } from "@/components/ui/display";
import { ActionForm, Field, FormActions, FormGrid, Input, MoneyInput, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { PhotoPicker } from "@/components/ui/file-input";
import { ActionDialog } from "@/components/ui/overlays";
import { QuickAction } from "@/components/ui/quick-action";
import { useI18n } from "@/components/i18n-provider";
import { assignAction, completeAction, costAction, holdAction, noteAction, startAction } from "@/app/actions/maintenance";

/**
 * What can be done next, by status:
 *  submitted   start work
 *  in progress put on hold (note the tenant sees), or complete (cost optional)
 *  waiting     resume
 *  completed   add or correct the cost
 */
export function RequestActions({ id, status, isManager, canWork, hasCost, technicians, categories, defaultCategory }: {
  id: string; status: string; isManager: boolean; canWork: boolean; hasCost: boolean; technicians: { id: string; name: string }[]; categories: { id: string; label: string }[]; defaultCategory: string;
}) {
  const { t } = useI18n();
  const open = status !== "completed";
  return (
    <Card>
      <CardHeader title={t("maint.next_step")} />
      <CardBody className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {canWork && (status === "submitted" || status === "waiting") ? <QuickAction action={startAction} hidden={{ id }} size="md">{status === "waiting" ? t("maint.act.resume") : t("maint.act.start")}</QuickAction> : null}
          {canWork && status === "in_progress" ? (
            <ActionDialog trigger={t("maint.act.hold")} triggerVariant="secondary" triggerSize="md" title={t("maint.act.hold")} description={t("maint.hold_hint")} action={holdAction} hidden={{ id }} submitLabel={t("maint.act.hold")}>
              <Field label={t("maint.note_for_tenant")} name="note" required><Textarea name="note" rows={3} placeholder={t("maint.hold_ph")} /></Field>
            </ActionDialog>
          ) : null}
          {isManager && open && technicians.length > 0 ? (
            <ActionDialog trigger={t("maint.act.assign")} triggerVariant="ghost" triggerSize="md" title={t("maint.act.assign")} description={t("maint.assign_hint")} action={assignAction} hidden={{ id }}>
              <Field label={t("maint.technician")} name="assigneeId" required>
                <Select name="assigneeId" defaultValue=""><option value="">{t("common.select_placeholder")}</option>{technicians.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>
              </Field>
            </ActionDialog>
          ) : null}
          {canWork ? (
            <ActionDialog trigger={t("maint.act.note")} triggerVariant="ghost" triggerSize="md" title={t("maint.act.note")} description={t("maint.note_hint")} action={noteAction} hidden={{ id }}>
              <Field label={t("common.notes")} name="note" required><Textarea name="note" rows={3} /></Field>
            </ActionDialog>
          ) : null}
        </div>

        {canWork && status === "in_progress" ? (
          <ActionForm action={completeAction} className="space-y-4 border-t border-line pt-4">
            <input type="hidden" name="id" value={id} />
            <h3 className="text-[14px] font-semibold">{t("maint.complete_title")}</h3>
            <Field label={t("maint.category")} name="categoryId" required>
              <Select name="categoryId" defaultValue={defaultCategory}><option value="">{t("common.select_placeholder")}</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</Select>
            </Field>
            <Field label={t("maint.work")} name="workPerformed" required><Textarea name="workPerformed" rows={3} /></Field>
            <Field label={t("maint.cost_optional")} name="cost" hint={t("maint.cost_optional_hint")}><MoneyInput name="cost" /></Field>
            <FormGrid>
              <Field label={t("maint.note_for_tenant")} name="tenantNote" optional><Input name="tenantNote" /></Field>
              <Field label={t("maint.internal_note")} name="technicianNotes" optional><Input name="technicianNotes" /></Field>
            </FormGrid>
            <PhotoPicker label={t("maint.work_photos")} />
            <FormActions><SubmitButton>{t("maint.act.complete")}</SubmitButton></FormActions>
          </ActionForm>
        ) : null}

        {status === "completed" && (canWork || isManager) && (!hasCost || isManager) ? (
          <div className="border-t border-line pt-4">
            <ActionDialog trigger={hasCost ? t("maint.act.change_cost") : t("maint.act.add_cost")} triggerVariant="secondary" triggerSize="md" title={hasCost ? t("maint.act.change_cost") : t("maint.act.add_cost")} description={t("maint.cost_optional_hint")} action={costAction} hidden={{ id }} submitLabel={t("common.save")}>
              <Field label={t("maint.cost_optional")} name="cost"><MoneyInput name="cost" /></Field>
              {hasCost ? <Field label={t("common.reason")} name="reason" required><Textarea name="reason" rows={2} /></Field> : null}
            </ActionDialog>
          </div>
        ) : null}
        {status === "completed" ? <p className="text-[13.5px] text-ok-700">{hasCost ? t("maint.charged_note") : t("maint.tenant_pays_note")}</p> : null}
      </CardBody>
    </Card>
  );
}

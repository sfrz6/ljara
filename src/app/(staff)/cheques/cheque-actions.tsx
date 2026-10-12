"use client";

import { Check, Landmark } from "lucide-react";
import { ActionDialog } from "@/components/ui/overlays";
import { QuickAction } from "@/components/ui/quick-action";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { useI18n } from "@/components/i18n-provider";
import { attachScanAction } from "@/app/actions/contracts";
import { DocumentPicker } from "@/components/ui/file-input";
import { bounceAction, collectAction, depositAction, followUpAction, recoverAction, writeOffAction } from "@/app/actions/cheques";

/** Only the actions the cheque state machine allows from the current status are offered. */
export function ChequeActions({ id, status, canProcess, canWriteOff, number, hasScan, scanId }: { id: string; status: string; canProcess: boolean; canWriteOff: boolean; number: string; hasScan?: boolean; scanId?: string | null }) {
  const { t } = useI18n();
  if (!canProcess) return scanId ? <a className="text-[13px] font-medium text-brand-700 underline" href={"/api/files/" + scanId} target="_blank" rel="noreferrer">{t("cheque.view_scan")}</a> : null;
  const reasonField = (label: string) => (
    <Field label={label} name="reason" required>
      <Textarea name="reason" rows={2} />
    </Field>
  );
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {scanId ? <a className="inline-flex h-9 items-center px-2 text-[13px] font-medium text-brand-700 underline md:h-8" href={"/api/files/" + scanId} target="_blank" rel="noreferrer">{t("cheque.view_scan")}</a> : null}
      <ActionDialog trigger={hasScan ? t("cheque.replace_scan") : t("cheque.add_scan")} triggerVariant="ghost" title={t("cheque.add_scan")} action={attachScanAction} hidden={{ id }} submitLabel={t("common.save")}>
        <DocumentPicker name="scan" label={t("contract.cheque_scan")} />
      </ActionDialog>
      {status === "due" ? (
        <>
          <QuickAction action={collectAction} hidden={{ id }} icon={<Check className="size-4" />}>{t("cheque.act.collect")}</QuickAction>
          <QuickAction action={depositAction} hidden={{ id }} variant="secondary" icon={<Landmark className="size-4" />}>{t("cheque.act.deposit")}</QuickAction>
        </>
      ) : null}
      {status === "deposited" ? (
        <>
          <QuickAction action={collectAction} hidden={{ id }} icon={<Check className="size-4" />}>{t("cheque.act.collect")}</QuickAction>
          <ActionDialog trigger={t("cheque.act.bounce")} triggerVariant="danger" title={t("cheque.act.bounce_title", { number })} description={t("cheque.act.bounce_hint")} action={bounceAction} hidden={{ id }} submitVariant="danger" submitLabel={t("cheque.act.bounce")}>
            {reasonField(t("cheque.bounce_reason"))}
          </ActionDialog>
        </>
      ) : null}
      {status === "bounced" ? (
        <ActionDialog trigger={t("cheque.act.follow_up")} triggerVariant="primary" title={t("cheque.act.follow_up")} action={followUpAction} hidden={{ id }}>
          <Field label={t("common.notes")} name="note" required>
            <Textarea name="note" rows={3} />
          </Field>
        </ActionDialog>
      ) : null}
      {status === "follow_up" ? (
        <>
          <ActionDialog trigger={t("cheque.act.recover")} title={t("cheque.act.recover")} description={t("cheque.act.recover_hint")} action={recoverAction} hidden={{ id }}>
            <Field label={t("common.type")} name="method">
              <Select name="method" defaultValue="cash">
                <option value="cash">{t("method.cash")}</option>
                <option value="bank_transfer">{t("method.bank_transfer")}</option>
                <option value="cheque">{t("method.cheque")}</option>
              </Select>
            </Field>
            <Field label={t("cheque.reference")} name="reference" optional>
              <Input name="reference" />
            </Field>
          </ActionDialog>
          {canWriteOff ? (
            <ActionDialog trigger={t("cheque.act.write_off")} triggerVariant="ghost" title={t("cheque.act.write_off")} description={t("cheque.act.write_off_hint")} action={writeOffAction} hidden={{ id }} submitVariant="danger">
              {reasonField(t("common.reason"))}
            </ActionDialog>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

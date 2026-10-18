"use client";

import { Card, CardBody, CardHeader } from "@/components/ui/display";
import { ActionDialog } from "@/components/ui/overlays";
import { QuickAction } from "@/components/ui/quick-action";
import { DocumentPicker } from "@/components/ui/file-input";
import { Field, FormGrid, Input, MoneyInput, Select, Textarea } from "@/components/ui/form";
import { useI18n } from "@/components/i18n-provider";
import { activateContractAction, addChequeAction, updateContractAction, cancelContractAction, completeMoveOutAction, giveNoticeAction, resolveDepositAction, sendPaymentLinkAction, withdrawNoticeAction } from "@/app/actions/contracts";
import { manualPaymentAction } from "@/app/actions/finance";

const today = () => new Date().toISOString().slice(0, 10);

export function ContractActions({ id, status, noticeGiven, renewed, depositHeld, ended, sanad, notes, electricity, water }: { id: string; status: string; noticeGiven: boolean; renewed: boolean; depositHeld: boolean; ended: boolean; sanad: string; notes: string; electricity: string; water: string }) {
  const { t } = useI18n();
  return (
    <Card>
      <CardHeader title={t("contract.actions")} />
      <CardBody className="flex flex-col items-stretch gap-2">
        <ActionDialog trigger={t("contract.edit_details")} triggerVariant="ghost" triggerSize="md" title={t("contract.edit_details")} description={t("contract.edit_hint")} action={updateContractAction} hidden={{ id }} submitLabel={t("common.save")}>
          <Field label={t("contract.sanad")} name="sanadReference" optional><Input name="sanadReference" defaultValue={sanad} /></Field>
          <Field label={t("contract.electricity")} name="electricityAccount" hint={t("contract.utility_hint")} optional><Input name="electricityAccount" dir="ltr" defaultValue={electricity} /></Field>
          <Field label={t("contract.water")} name="waterAccount" optional><Input name="waterAccount" dir="ltr" defaultValue={water} /></Field>
          <Field label={t("common.notes")} name="notes" optional><Textarea name="notes" rows={3} defaultValue={notes} /></Field>
          <DocumentPicker name="signedDoc" label={t("contract.signed_doc")} />
        </ActionDialog>
        {status === "pending" ? (
          <>
            <QuickAction action={activateContractAction} hidden={{ id }} size="md">{t("contract.act.start")}</QuickAction>
            <ActionDialog trigger={t("contract.act.cancel")} triggerVariant="ghost" triggerSize="md" title={t("contract.act.cancel")} description={t("contract.act.cancel_hint")} action={cancelContractAction} hidden={{ id }} submitVariant="danger">
              <Field label={t("common.reason")} name="reason" required><Textarea name="reason" rows={2} /></Field>
            </ActionDialog>
          </>
        ) : null}
        {status === "active" && !renewed && !noticeGiven ? (
          <ActionDialog trigger={t("contract.act.move_out")} triggerVariant="secondary" triggerSize="md" title={t("contract.act.move_out")} description={t("contract.act.move_out_hint")} action={giveNoticeAction} hidden={{ id }} submitLabel={t("contract.act.record_notice")}>
            <FormGrid>
              <Field label={t("contract.notice_on")} name="noticeGivenOn" required><Input name="noticeGivenOn" type="date" defaultValue={today()} /></Field>
              <Field label={t("contract.move_out_on")} name="moveOutDate" required><Input name="moveOutDate" type="date" defaultValue={today()} /></Field>
            </FormGrid>
          </ActionDialog>
        ) : null}
        {status === "active" && noticeGiven ? (
          <>
            <ActionDialog trigger={t("contract.act.complete_move_out")} triggerVariant="primary" triggerSize="md" title={t("contract.act.complete_move_out")} description={t("contract.act.complete_hint")} action={completeMoveOutAction} hidden={{ id }} />
            <QuickAction action={withdrawNoticeAction} hidden={{ id }} variant="ghost" size="md">{t("contract.act.withdraw")}</QuickAction>
          </>
        ) : null}
        {ended && depositHeld ? (
          <ActionDialog trigger={t("contract.act.resolve_deposit")} triggerVariant="secondary" triggerSize="md" title={t("contract.act.resolve_deposit")} description={t("contract.act.deposit_hint")} action={resolveDepositAction} hidden={{ id }}>
            <Field label={t("common.status")} name="resolution"><Select name="resolution" defaultValue="returned"><option value="returned">{t("contract.deposit.returned")}</option><option value="applied">{t("contract.deposit.applied")}</option></Select></Field>
            <Field label={t("common.notes")} name="note" required><Textarea name="note" rows={2} /></Field>
          </ActionDialog>
        ) : null}
      </CardBody>
    </Card>
  );
}

export function ScheduleRowActions({ contractId, itemId, amount, dueDate, open, hasLiveCheque, canCheque, canPay }: { contractId: string; itemId: string; amount: string; dueDate: string; open: boolean; hasLiveCheque: boolean; canCheque: boolean; canPay: boolean }) {
  const { t } = useI18n();
  if (!open || hasLiveCheque) return null;
  return (
    <div className="flex gap-1.5">
      {canCheque ? (
        <ActionDialog trigger={t("contract.add_cheque")} triggerVariant="secondary" title={t("contract.add_cheque")} action={addChequeAction} hidden={{ itemId, contractId }}>
          <FormGrid>
            <Field label={t("contract.cheque_no")} name="chequeNumber" required><Input name="chequeNumber" /></Field>
            <Field label={t("contract.bank")} name="bank" required><Input name="bank" /></Field>
            <Field label={t("common.date")} name="chequeDate" required><Input name="chequeDate" type="date" defaultValue={dueDate} /></Field>
            <Field label={t("common.amount")} name="amount" required><MoneyInput name="amount" defaultValue={amount} /></Field>
          </FormGrid>
          <DocumentPicker name="scan" label={t("contract.cheque_scan")} />
        </ActionDialog>
      ) : null}
      {canPay ? (
        <>
          <ActionDialog trigger={t("contract.record_payment")} triggerVariant="primary" title={t("contract.record_payment")} description={t("contract.record_payment_hint", { amount })} action={manualPaymentAction} hidden={{ itemId }} submitLabel={t("contract.record_payment")}>
            <Field label={t("common.type")} name="method"><Select name="method" defaultValue="cash"><option value="cash">{t("method.cash")}</option><option value="bank_transfer">{t("method.bank_transfer")}</option></Select></Field>
            <Field label={t("cheque.reference")} name="reference" optional><Input name="reference" /></Field>
          </ActionDialog>
          <QuickAction action={sendPaymentLinkAction} hidden={{ itemId, contractId }} variant="ghost">{t("contract.send_link")}</QuickAction>
        </>
      ) : null}
    </div>
  );
}

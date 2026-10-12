"use client";

import { Field, FormGrid, Input, Select, Textarea } from "@/components/ui/form";
import { useI18n } from "@/components/i18n-provider";
import { bpToPercentString } from "@/lib/money";

export interface OwnerDefaults {
  nameEn?: string;
  nameAr?: string | null;
  phone?: string | null;
  email?: string | null;
  commissionBp?: number;
  payoutFrequency?: string;
  receiptPrefix?: string;
  rentIncreaseCapBp?: number | null;
  notes?: string | null;
}

/** Fields shared by the create and edit dialogs. Commission and cap are entered as percentages. */
export function OwnerFields({ d = {}, prefixLocked }: { d?: OwnerDefaults; prefixLocked?: boolean }) {
  const { t } = useI18n();
  return (
    <>
      <FormGrid>
        <Field label={t("owner.name_en")} name="nameEn" required><Input name="nameEn" defaultValue={d.nameEn} /></Field>
        <Field label={t("owner.name_ar")} name="nameAr" optional><Input name="nameAr" dir="rtl" defaultValue={d.nameAr ?? ""} /></Field>
        <Field label={t("common.phone")} name="phone" optional><Input name="phone" type="tel" defaultValue={d.phone ?? ""} /></Field>
        <Field label={t("common.email")} name="email" optional><Input name="email" type="email" defaultValue={d.email ?? ""} /></Field>
      </FormGrid>
      <FormGrid>
        <Field label={t("owner.commission")} name="commissionPercent" hint={t("owner.commission_hint")} required>
          <Input name="commissionPercent" inputMode="decimal" defaultValue={d.commissionBp !== undefined ? bpToPercentString(d.commissionBp) : "5"} />
        </Field>
        <Field label={t("owner.payout")} name="payoutFrequency">
          <Select name="payoutFrequency" defaultValue={d.payoutFrequency ?? "monthly"}>
            {["monthly", "quarterly", "semi_annual", "annual", "other"].map((f) => <option key={f} value={f}>{t(`freq.${f}` as never)}</option>)}
          </Select>
        </Field>
        <Field label={t("owner.prefix")} name="receiptPrefix" hint={prefixLocked ? t("err.receipt_prefix_locked") : t("owner.prefix_hint")} required>
          <Input name="receiptPrefix" defaultValue={d.receiptPrefix} readOnly={prefixLocked} maxLength={8} className="uppercase" />
        </Field>
        <Field label={t("owner.cap")} name="capPercent" hint={t("owner.cap_hint")} optional>
          <Input name="capPercent" inputMode="decimal" defaultValue={d.rentIncreaseCapBp != null ? bpToPercentString(d.rentIncreaseCapBp) : ""} />
        </Field>
      </FormGrid>
      <Field label={t("common.notes")} name="notes" optional><Textarea name="notes" rows={2} defaultValue={d.notes ?? ""} /></Field>
    </>
  );
}

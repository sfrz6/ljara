"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { Card, CardBody, Money, Num } from "@/components/ui/display";
import { ActionForm, Alert, Checkbox, Field, FormActions, FormGrid, Input, MoneyInput, Select, SubmitButton, Textarea } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { DocumentPicker } from "@/components/ui/file-input";
import { useI18n } from "@/components/i18n-provider";
import { createContractAction } from "@/app/actions/contracts";
import { evaluateRenewalIncrease, generateSchedule, type PaymentFrequency } from "@/domain/finance";
import { isValidISO } from "@/lib/dates";
import { baisaToDecimalString, parseOMR, bpToPercentString } from "@/lib/money";
import { cn } from "@/lib/cn";

interface UnitOpt { id: string; label: string; rent: string; capBp: number | null; capLevel: string }
interface Props {
  units: UnitOpt[];
  tenants: { id: string; label: string }[];
  defaults: { unitId: string; tenantId: string; start: string; end: string; previousContractId: string; currentRent: string; electricityAccount: string; waterAccount: string };
  lockParties: boolean;
}

/**
 * Guided contract entry in four steps. All inputs stay mounted (hidden steps are only collapsed) so one submit
 * carries everything. The schedule and the cheque grid are generated live from the terms, then saved atomically.
 */
export function ContractWizard({ units, tenants, defaults, lockParties }: Props) {
  const { t, locale } = useI18n();
  const [step, setStep] = useState(1);
  const [unitId, setUnitId] = useState(defaults.unitId);
  const [tenantId, setTenantId] = useState(defaults.tenantId);
  const [start, setStart] = useState(defaults.start);
  const [end, setEnd] = useState(defaults.end);
  const unit = units.find((u) => u.id === unitId);
  const [rent, setRent] = useState(defaults.currentRent || unit?.rent || "");
  const [freq, setFreq] = useState<PaymentFrequency>("monthly");
  const [payBy, setPayBy] = useState<"cheques" | "other">("cheques");
  const [bank, setBank] = useState("");
  const [firstNo, setFirstNo] = useState("");
  const [overrides, setOverrides] = useState<Record<number, { no?: string; bank?: string; date?: string; amount?: string }>>({});
  const [secAmount, setSecAmount] = useState("");
  const [override, setOverride] = useState("");

  const rentBaisa = parseOMR(rent);
  const schedule = useMemo(() => {
    if (!isValidISO(start) || !isValidISO(end) || rentBaisa === null || rentBaisa <= 0 || end <= start) return [];
    return generateSchedule({ startDate: start, endDate: end, monthlyRentBaisa: rentBaisa, frequency: freq });
  }, [start, end, rentBaisa, freq]);

  const rows = schedule.map((l, i) => {
    const o = overrides[l.seq] ?? {};
    const base = firstNo && /^\d+$/.test(firstNo) ? String(BigInt(firstNo) + BigInt(i)).padStart(firstNo.length, "0") : "";
    return { seq: l.seq, chequeNumber: o.no ?? base, bank: o.bank ?? bank, chequeDate: o.date ?? l.dueDate, amountBaisa: parseOMR(o.amount ?? baisaToDecimalString(l.amountBaisa)) ?? 0, amountText: o.amount ?? baisaToDecimalString(l.amountBaisa) };
  });
  const chequesJson = JSON.stringify(rows.map(({ seq, chequeNumber, bank: b, chequeDate, amountBaisa }) => ({ seq, chequeNumber, bank: b, chequeDate, amountBaisa })));
  const setRow = (seq: number, patch: { no?: string; bank?: string; date?: string; amount?: string }) => setOverrides((p) => ({ ...p, [seq]: { ...p[seq], ...patch } }));

  const renewal = defaults.previousContractId && defaults.currentRent && rentBaisa ? evaluateRenewalIncrease({ currentRent: parseOMR(defaults.currentRent) ?? 0, proposedRent: rentBaisa, capBp: unit?.capBp ?? null }) : null;
  const total = schedule.reduce((a, l) => a + l.amountBaisa, 0);
  const stepOk = [true, !!unitId && !!tenantId, schedule.length > 0 && isValidISO(start) && isValidISO(end), payBy === "other" || rows.every((r) => r.chequeNumber && r.bank), true];
  const labels = [t("contract.step.parties"), t("contract.step.terms"), t("contract.step.payment"), t("contract.step.security")];
  const show = (n: number) => (step === n ? "block" : "hidden");

  return (
    <ActionForm action={createContractAction} encType="multipart/form-data" className="max-w-3xl space-y-5">
      <ol className="flex gap-1.5" aria-label="Steps">
        {labels.map((l, i) => (
          <li key={l} className="flex-1">
            <button type="button" onClick={() => (i + 1 <= step || stepOk.slice(1, i + 1).every(Boolean)) && setStep(i + 1)} className={cn("w-full border-t-4 pt-2 text-start text-[12.5px] font-medium", i + 1 === step ? "border-brass-500 text-ink" : i + 1 < step ? "border-brand-700 text-ink-2" : "border-line text-ink-3")}>
              <span className="block text-[11px] uppercase tracking-wide text-ink-3">{i + 1}</span>
              {l}
            </button>
          </li>
        ))}
      </ol>

      <input type="hidden" name="unitId" value={unitId} />
      <input type="hidden" name="tenantId" value={tenantId} />
      <input type="hidden" name="previousContractId" value={defaults.previousContractId} />
      <input type="hidden" name="chequesJson" value={chequesJson} />

      <Card className={show(1)}>
        <CardBody className="space-y-4">
          <Field label={t("common.unit")} name="unitId" required>
            <Select value={unitId} disabled={lockParties} onChange={(e) => { setUnitId(e.target.value); const u = units.find((x) => x.id === e.target.value); if (u && !defaults.currentRent) setRent(u.rent); }}>
              <option value="">{t("common.select_placeholder")}</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
            </Select>
          </Field>
          {units.length === 0 ? <Alert tone="warn">{t("contract.no_available_units")} <Link href="/units" className="underline">{t("nav.units")}</Link></Alert> : null}
          <Field label={t("common.tenant")} name="tenantId" required>
            <Select value={tenantId} disabled={lockParties} onChange={(e) => setTenantId(e.target.value)}>
              <option value="">{t("common.select_placeholder")}</option>
              {tenants.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
            </Select>
          </Field>
          {!lockParties ? <p className="text-[13px] text-ink-2">{t("contract.tenant_missing")} <Link href="/tenants/new?next=/contracts/new" className="font-medium text-brand-700 underline">{t("tenant.add")}</Link></p> : null}
        </CardBody>
      </Card>

      <Card className={show(2)}>
        <CardBody className="space-y-4">
          <p className="text-[13px] text-ink-2">{t("contract.sanad_hint")}</p>
          <FormGrid>
            <Field label={t("contract.start")} name="startDate" required><Input name="startDate" type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
            <Field label={t("contract.end")} name="endDate" required><Input name="endDate" type="date" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
            <Field label={t("unit.monthly_rent")} name="monthlyRent" required><MoneyInput name="monthlyRent" value={rent} onChange={(e) => setRent(e.target.value)} /></Field>
            <Field label={t("contract.frequency")} name="paymentFrequency">
              <Select name="paymentFrequency" value={freq} onChange={(e) => setFreq(e.target.value as PaymentFrequency)}>
                {(["monthly", "quarterly", "semi_annual", "annual"] as const).map((f) => <option key={f} value={f}>{t(`freq.${f}` as never)}</option>)}
              </Select>
            </Field>
          </FormGrid>
          <Field label={t("contract.sanad")} name="sanadReference" optional><Input name="sanadReference" /></Field>
          <FormGrid>
            <Field label={t("contract.electricity")} name="electricityAccount" hint={t("contract.utility_hint")} optional><Input name="electricityAccount" inputMode="text" dir="ltr" defaultValue={defaults.electricityAccount} /></Field>
            <Field label={t("contract.water")} name="waterAccount" optional><Input name="waterAccount" inputMode="text" dir="ltr" defaultValue={defaults.waterAccount} /></Field>
          </FormGrid>
          {renewal && unit?.capBp !== null ? (
            <Alert tone={renewal.exceedsCap ? "warn" : "info"} title={t("contract.cap_title", { pct: bpToPercentString(Math.max(0, renewal.increaseBp)), cap: bpToPercentString(unit?.capBp ?? 0) })}>
              {t("contract.cap_level", { level: t(`cap.level.${unit?.capLevel ?? "none"}` as never) })}
              {renewal.exceedsCap ? (
                <div className="mt-2">
                  <p className="font-medium">{t("contract.cap_over")}</p>
                  <Textarea name="capOverrideReason" rows={2} value={override} onChange={(e) => setOverride(e.target.value)} placeholder={t("contract.cap_reason")} className="mt-1.5" />
                </div>
              ) : null}
            </Alert>
          ) : null}
        </CardBody>
      </Card>

      <Card className={show(3)}>
        <CardBody className="space-y-4">
          <Field label={t("contract.pay_by")} name="payBy">
            <Select name="payBy" value={payBy} onChange={(e) => setPayBy(e.target.value as "cheques" | "other")}>
              <option value="cheques">{t("contract.pay_cheques")}</option>
              <option value="other">{t("contract.pay_other")}</option>
            </Select>
          </Field>
          <p className="text-[13px] text-ink-2">{t("contract.schedule_hint", { n: schedule.length })} <Money baisa={total} locale={locale} strong /></p>
          {payBy === "cheques" ? (
            <>
              <FormGrid>
                <Field label={t("contract.bank_all")}><Input value={bank} onChange={(e) => setBank(e.target.value)} placeholder="Bank Muscat" /></Field>
                <Field label={t("contract.first_cheque")} hint={t("contract.first_cheque_hint")}><Input value={firstNo} onChange={(e) => setFirstNo(e.target.value)} inputMode="numeric" /></Field>
              </FormGrid>
              <div className="space-y-2.5">
                {rows.map((r) => (
                  <div key={r.seq} className="grid grid-cols-2 gap-2 rounded-md border border-line bg-surface-2 p-2.5 md:grid-cols-[2rem_1fr_1fr_9rem_8rem] md:items-center">
                    <span className="col-span-2 text-[12px] font-semibold text-ink-3 md:col-span-1"><Num>{r.seq}</Num></span>
                    <Input aria-label={t("contract.cheque_no")} placeholder={t("contract.cheque_no")} value={r.chequeNumber} onChange={(e) => setRow(r.seq, { no: e.target.value })} />
                    <Input aria-label={t("contract.bank")} placeholder={t("contract.bank")} value={r.bank} onChange={(e) => setRow(r.seq, { bank: e.target.value })} />
                    <Input aria-label={t("common.date")} type="date" value={r.chequeDate} onChange={(e) => setRow(r.seq, { date: e.target.value })} />
                    <MoneyInput aria-label={t("common.amount")} value={r.amountText} onChange={(e) => setRow(r.seq, { amount: e.target.value })} />
                  </div>
                ))}
              </div>
            </>
          ) : <Alert>{t("contract.pay_other_hint")}</Alert>}
        </CardBody>
      </Card>

      <Card className={show(4)}>
        <CardBody className="space-y-4">
          <Alert tone="info">{t("contract.security_hint")}</Alert>
          <FormGrid>
            <Field label={t("contract.security_amount")} name="securityAmount" optional><MoneyInput name="securityAmount" value={secAmount} onChange={(e) => setSecAmount(e.target.value)} /></Field>
            <Field label={t("contract.cheque_no")} name="securityNumber" optional><Input name="securityNumber" /></Field>
            <Field label={t("contract.bank")} name="securityBank" optional><Input name="securityBank" /></Field>
            <Field label={t("common.date")} name="securityDate" optional><Input name="securityDate" type="date" /></Field>
          </FormGrid>
          <DocumentPicker name="securityScan" label={t("contract.security_scan")} />
          <DocumentPicker name="signedDoc" label={t("contract.signed_doc")} />
          <Field label={t("common.notes")} name="notes" optional><Textarea name="notes" rows={2} /></Field>
          <Checkbox label={t("contract.confirm")} name="confirm" required />
        </CardBody>
      </Card>

      <FormActions className="sm:justify-between">
        <Button variant="ghost" onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1}>{t("common.back")}</Button>
        {step < 4 ? (
          <Button onClick={() => stepOk[step] && setStep(step + 1)} disabled={!stepOk[step]}>{t("common.next")}<ArrowRight className="rtl-flip size-4" aria-hidden /></Button>
        ) : (
          <SubmitButton size="lg"><Check className="size-4" aria-hidden />{defaults.previousContractId ? t("contract.save_renewal") : t("contract.save")}</SubmitButton>
        )}
      </FormActions>
    </ActionForm>
  );
}

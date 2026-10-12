import { addMonths, monthsBetweenInclusive, type ISODate } from "@/lib/dates";
import { applyBasisPoints, assertBaisa, sum, type Baisa } from "@/lib/money";

/**
 * All owner and rent arithmetic lives here and nowhere else (proposal 4.5, layer two).
 * Security deposits are deliberately NOT a parameter of any function in this file:
 * the exclusion is structural, not a filter someone has to remember.
 */

export type PaymentFrequency = "monthly" | "quarterly" | "semi_annual" | "annual";
export type GatewayFeeMode = "office_absorbs" | "owner_net" | "owner_line";

export const MONTHS_PER_PERIOD: Record<PaymentFrequency, number> = {
  monthly: 1,
  quarterly: 3,
  semi_annual: 6,
  annual: 12,
};

/* ------------------------------ Rent schedule ------------------------------ */

export interface ScheduleLine {
  seq: number;
  dueDate: ISODate;
  amountBaisa: Baisa;
  periodMonths: number;
}

/**
 * Generate the rent schedule for a whole contract term (CR-6.1).
 * One line per payment period; the last period may be shorter. No pro-rata of partial months (G5).
 */
export function generateSchedule(input: {
  startDate: ISODate;
  endDate: ISODate;
  monthlyRentBaisa: Baisa;
  frequency: PaymentFrequency;
}): ScheduleLine[] {
  assertBaisa(input.monthlyRentBaisa);
  const term = monthsBetweenInclusive(input.startDate, input.endDate);
  if (term < 1) return [];
  const per = MONTHS_PER_PERIOD[input.frequency];
  const count = Math.ceil(term / per);
  const lines: ScheduleLine[] = [];
  for (let k = 0; k < count; k++) {
    const periodMonths = Math.min(per, term - k * per);
    lines.push({
      seq: k + 1,
      dueDate: addMonths(input.startDate, k * per),
      amountBaisa: input.monthlyRentBaisa * periodMonths,
      periodMonths,
    });
  }
  return lines;
}

/* ------------------------------- Rent cap -------------------------------- */

export type CapLevel = "unit" | "owner" | "organisation" | "none";

/** Most specific wins: unit, then owner, then organisation (CR-15.3). */
export function resolveRentCap(input: {
  unitCapBp: number | null;
  ownerCapBp: number | null;
  orgCapBp: number | null;
}): { capBp: number | null; level: CapLevel } {
  if (input.unitCapBp !== null) return { capBp: input.unitCapBp, level: "unit" };
  if (input.ownerCapBp !== null) return { capBp: input.ownerCapBp, level: "owner" };
  if (input.orgCapBp !== null) return { capBp: input.orgCapBp, level: "organisation" };
  return { capBp: null, level: "none" };
}

export function increaseBasisPoints(currentRent: Baisa, proposedRent: Baisa): number {
  if (currentRent <= 0) return 0;
  const diff = BigInt(proposedRent - currentRent) * 10000n;
  const denom = BigInt(currentRent);
  const negative = diff < 0n;
  const abs = negative ? -diff : diff;
  const rounded = (abs * 2n + denom) / (denom * 2n);
  return Number(negative ? -rounded : rounded);
}

export function evaluateRenewalIncrease(input: {
  currentRent: Baisa;
  proposedRent: Baisa;
  capBp: number | null;
}): { increaseBp: number; exceedsCap: boolean } {
  const increaseBp = increaseBasisPoints(input.currentRent, input.proposedRent);
  return { increaseBp, exceedsCap: input.capBp !== null && increaseBp > input.capBp };
}

/* ---------------------------- Owner statement ---------------------------- */

export interface StatementPayment {
  amountBaisa: Baisa;
  gatewayFeeBaisa: Baisa;
  status: "posted" | "voided";
}

export interface StatementMaintenanceCost {
  costBaisa: Baisa;
}

export interface StatementTotals {
  /** Gross rent actually received for the owner's units in the period (posted payments only). */
  grossCollectedBaisa: Baisa;
  gatewayFeesBaisa: Baisa;
  /** The figure printed as "rent collected" under the chosen gateway fee mode. */
  rentCollectedBaisa: Baisa;
  /** Gateway fee shown as its own deduction line (mode owner_line only). */
  gatewayFeeLineBaisa: Baisa;
  maintenanceBaisa: Baisa;
  managementFeeBaisa: Baisa;
  vatOnFeeBaisa: Baisa;
  netToOwnerBaisa: Baisa;
}

/**
 * net to owner = rent collected - maintenance costs - management fee   (CR-12.2)
 *
 * Gateway fee modes (proposal 14.6):
 *  office_absorbs  A: owner sees gross, the office pays the fee. Default.
 *  owner_net       B: rent collected is net of the fee, fee silently borne by owner.
 *  owner_line      C: rent collected is gross, fee shown as a separate deduction.
 * Optional VAT applies to the management fee only (switched off by default, 02 2.3.5).
 */
export function computeOwnerStatement(input: {
  payments: StatementPayment[];
  maintenance: StatementMaintenanceCost[];
  commissionBp: number;
  gatewayFeeMode: GatewayFeeMode;
  vat?: { enabled: boolean; bp: number };
}): StatementTotals {
  const posted = input.payments.filter((p) => p.status === "posted");
  const grossCollectedBaisa = sum(posted.map((p) => p.amountBaisa));
  const gatewayFeesBaisa = sum(posted.map((p) => p.gatewayFeeBaisa));
  const maintenanceBaisa = sum(input.maintenance.map((m) => m.costBaisa));

  let rentCollectedBaisa = grossCollectedBaisa;
  let gatewayFeeLineBaisa = 0;
  if (input.gatewayFeeMode === "owner_net") rentCollectedBaisa = grossCollectedBaisa - gatewayFeesBaisa;
  if (input.gatewayFeeMode === "owner_line") gatewayFeeLineBaisa = gatewayFeesBaisa;

  const managementFeeBaisa = applyBasisPoints(rentCollectedBaisa, input.commissionBp);
  const vatOnFeeBaisa = input.vat?.enabled ? applyBasisPoints(managementFeeBaisa, input.vat.bp) : 0;
  const netToOwnerBaisa =
    rentCollectedBaisa - maintenanceBaisa - managementFeeBaisa - gatewayFeeLineBaisa - vatOnFeeBaisa;

  return {
    grossCollectedBaisa,
    gatewayFeesBaisa,
    rentCollectedBaisa,
    gatewayFeeLineBaisa,
    maintenanceBaisa,
    managementFeeBaisa,
    vatOnFeeBaisa,
    netToOwnerBaisa,
  };
}

/** Online gateway fee for a payment amount, rounded half up. */
export function gatewayFee(amount: Baisa, feeBp: number): Baisa {
  return applyBasisPoints(amount, feeBp);
}

/* ------------------------------ Receipts --------------------------------- */

export function formatReceiptNumber(prefix: string, number: number): string {
  return `${prefix}-${String(number).padStart(5, "0")}`;
}

/* ------------------------- Tenant facing status -------------------------- */

export type TenantScheduleStatus = "upcoming" | "due" | "paid" | "action_needed";

/**
 * Limited vocabulary shown to tenants (proposal 14.2). Bank level and internal states
 * (deposited, follow up, written off) are never exposed. Bounced shows as "action needed".
 */
export function tenantScheduleStatus(input: {
  itemStatus: "open" | "paid" | "written_off" | "cancelled";
  chequeStatus: string | null;
  dueDate: ISODate;
  today: ISODate;
}): TenantScheduleStatus {
  if (input.itemStatus === "paid") return "paid";
  if (input.chequeStatus === "bounced" || input.chequeStatus === "follow_up") return "action_needed";
  if (input.chequeStatus === "deposited") return "paid";
  if (input.dueDate <= input.today) return "due";
  return "upcoming";
}

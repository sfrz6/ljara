import { describe, expect, it } from "vitest";
import {
  computeOwnerStatement,
  evaluateRenewalIncrease,
  formatReceiptNumber,
  generateSchedule,
  resolveRentCap,
  tenantScheduleStatus,
} from "@/domain/finance";

const posted = (amountBaisa: number, gatewayFeeBaisa = 0) => ({ amountBaisa, gatewayFeeBaisa, status: "posted" as const });

describe("owner payout calculation (CR-12.2)", () => {
  it("net = rent collected - maintenance - management fee", () => {
    const t = computeOwnerStatement({
      payments: [posted(500_000), posted(300_000)],
      maintenance: [{ costBaisa: 30_000 }, { costBaisa: 20_000 }],
      commissionBp: 500,
      gatewayFeeMode: "office_absorbs",
    });
    expect(t.rentCollectedBaisa).toBe(800_000);
    expect(t.maintenanceBaisa).toBe(50_000);
    expect(t.managementFeeBaisa).toBe(40_000);
    expect(t.netToOwnerBaisa).toBe(710_000);
  });

  it("supports zero commission for an owner managing his own property", () => {
    const t = computeOwnerStatement({ payments: [posted(420_000)], maintenance: [], commissionBp: 0, gatewayFeeMode: "office_absorbs" });
    expect(t.managementFeeBaisa).toBe(0);
    expect(t.netToOwnerBaisa).toBe(420_000);
  });

  it("ignores voided payments (bounced then re-collected is counted once)", () => {
    const t = computeOwnerStatement({
      payments: [{ amountBaisa: 300_000, gatewayFeeBaisa: 0, status: "voided" }, posted(300_000)],
      maintenance: [],
      commissionBp: 500,
      gatewayFeeMode: "office_absorbs",
    });
    expect(t.rentCollectedBaisa).toBe(300_000);
    expect(t.netToOwnerBaisa).toBe(285_000);
  });

  it("handles negative net when repairs exceed rent, never rounding silently", () => {
    const t = computeOwnerStatement({ payments: [posted(100_001)], maintenance: [{ costBaisa: 250_000 }], commissionBp: 500, gatewayFeeMode: "office_absorbs" });
    expect(t.managementFeeBaisa).toBe(5_000); // 5000.05 rounds half up to 5000
    expect(t.netToOwnerBaisa).toBe(100_001 - 250_000 - 5_000);
  });

  it("gateway fee mode A: office absorbs, owner sees gross (proposal 14.6 worked example)", () => {
    const t = computeOwnerStatement({ payments: [posted(500_000, 10_000)], maintenance: [{ costBaisa: 30_000 }], commissionBp: 500, gatewayFeeMode: "office_absorbs" });
    expect(t.rentCollectedBaisa).toBe(500_000);
    expect(t.managementFeeBaisa).toBe(25_000);
    expect(t.netToOwnerBaisa).toBe(445_000);
  });

  it("gateway fee mode B: owner absorbs, netted silently", () => {
    const t = computeOwnerStatement({ payments: [posted(500_000, 10_000)], maintenance: [{ costBaisa: 30_000 }], commissionBp: 500, gatewayFeeMode: "owner_net" });
    expect(t.rentCollectedBaisa).toBe(490_000);
    expect(t.managementFeeBaisa).toBe(24_500);
    expect(t.netToOwnerBaisa).toBe(435_500);
  });

  it("gateway fee mode C: owner absorbs, shown as its own line", () => {
    const t = computeOwnerStatement({ payments: [posted(500_000, 10_000)], maintenance: [{ costBaisa: 30_000 }], commissionBp: 500, gatewayFeeMode: "owner_line" });
    expect(t.rentCollectedBaisa).toBe(500_000);
    expect(t.gatewayFeeLineBaisa).toBe(10_000);
    expect(t.netToOwnerBaisa).toBe(435_000);
  });

  it("VAT line on the management fee is off by default and exact when switched on", () => {
    const off = computeOwnerStatement({ payments: [posted(1_000_000)], maintenance: [], commissionBp: 500, gatewayFeeMode: "office_absorbs" });
    expect(off.vatOnFeeBaisa).toBe(0);
    const on = computeOwnerStatement({ payments: [posted(1_000_000)], maintenance: [], commissionBp: 500, gatewayFeeMode: "office_absorbs", vat: { enabled: true, bp: 500 } });
    expect(on.managementFeeBaisa).toBe(50_000);
    expect(on.vatOnFeeBaisa).toBe(2_500);
    expect(on.netToOwnerBaisa).toBe(1_000_000 - 50_000 - 2_500);
  });
});

describe("rent schedule generation (CR-6.1)", () => {
  it("creates twelve monthly lines for a full year", () => {
    const lines = generateSchedule({ startDate: "2026-01-01", endDate: "2026-12-31", monthlyRentBaisa: 280_000, frequency: "monthly" });
    expect(lines).toHaveLength(12);
    expect(lines[0]).toMatchObject({ seq: 1, dueDate: "2026-01-01", amountBaisa: 280_000 });
    expect(lines[11].dueDate).toBe("2026-12-01");
    expect(lines.reduce((a, l) => a + l.amountBaisa, 0)).toBe(280_000 * 12);
  });

  it("keeps the day of month and clamps short months", () => {
    const lines = generateSchedule({ startDate: "2026-01-31", endDate: "2027-01-30", monthlyRentBaisa: 100_000, frequency: "monthly" });
    expect(lines[1].dueDate).toBe("2026-02-28");
    expect(lines[2].dueDate).toBe("2026-03-31");
  });

  it("supports quarterly, semi annual and annual payment", () => {
    expect(generateSchedule({ startDate: "2026-03-01", endDate: "2027-02-28", monthlyRentBaisa: 650_000, frequency: "quarterly" })).toHaveLength(4);
    expect(generateSchedule({ startDate: "2026-03-01", endDate: "2027-02-28", monthlyRentBaisa: 650_000, frequency: "semi_annual" })).toHaveLength(2);
    const annual = generateSchedule({ startDate: "2026-03-01", endDate: "2027-02-28", monthlyRentBaisa: 650_000, frequency: "annual" });
    expect(annual).toHaveLength(1);
    expect(annual[0].amountBaisa).toBe(650_000 * 12);
  });

  it("a final short period carries only its months", () => {
    const lines = generateSchedule({ startDate: "2026-01-01", endDate: "2026-10-31", monthlyRentBaisa: 100_000, frequency: "quarterly" });
    expect(lines.map((l) => l.amountBaisa)).toEqual([300_000, 300_000, 300_000, 100_000]);
  });
});

describe("rent increase cap, most specific wins (CR-15.3)", () => {
  it("resolves unit, then owner, then organisation", () => {
    expect(resolveRentCap({ unitCapBp: 200, ownerCapBp: 300, orgCapBp: 500 })).toEqual({ capBp: 200, level: "unit" });
    expect(resolveRentCap({ unitCapBp: null, ownerCapBp: 300, orgCapBp: 500 })).toEqual({ capBp: 300, level: "owner" });
    expect(resolveRentCap({ unitCapBp: null, ownerCapBp: null, orgCapBp: 500 })).toEqual({ capBp: 500, level: "organisation" });
    expect(resolveRentCap({ unitCapBp: null, ownerCapBp: null, orgCapBp: null })).toEqual({ capBp: null, level: "none" });
  });

  it("warns above the cap and never above a missing cap", () => {
    expect(evaluateRenewalIncrease({ currentRent: 300_000, proposedRent: 315_000, capBp: 500 })).toEqual({ increaseBp: 500, exceedsCap: false });
    expect(evaluateRenewalIncrease({ currentRent: 300_000, proposedRent: 330_000, capBp: 500 }).exceedsCap).toBe(true);
    expect(evaluateRenewalIncrease({ currentRent: 300_000, proposedRent: 450_000, capBp: null }).exceedsCap).toBe(false);
  });
});

describe("receipt numbers and tenant vocabulary", () => {
  it("formats the per owner series", () => {
    expect(formatReceiptNumber("SH", 7)).toBe("SH-00007");
  });

  it("never exposes bank level states to tenants (14.2)", () => {
    const base = { dueDate: "2026-05-01", today: "2026-05-10" };
    expect(tenantScheduleStatus({ ...base, itemStatus: "open", chequeStatus: "bounced" })).toBe("action_needed");
    expect(tenantScheduleStatus({ ...base, itemStatus: "open", chequeStatus: "follow_up" })).toBe("action_needed");
    expect(tenantScheduleStatus({ ...base, itemStatus: "open", chequeStatus: "deposited" })).toBe("paid");
    expect(tenantScheduleStatus({ ...base, itemStatus: "open", chequeStatus: "due" })).toBe("due");
    expect(tenantScheduleStatus({ ...base, dueDate: "2026-06-01", itemStatus: "open", chequeStatus: "received" })).toBe("upcoming");
    expect(tenantScheduleStatus({ ...base, itemStatus: "paid", chequeStatus: "collected" })).toBe("paid");
  });
});

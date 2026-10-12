import { describe, expect, it } from "vitest";
import {
  applyBasisPoints,
  baisaToDecimalString,
  bpToPercentString,
  formatAmount,
  formatOMR,
  parseOMR,
  parsePercentToBp,
  splitEvenly,
} from "@/lib/money";

describe("money conversion", () => {
  it("parses OMR text into whole baisa without floats", () => {
    expect(parseOMR("1,250.750")).toBe(1250750);
    expect(parseOMR("1250.75")).toBe(1250750);
    expect(parseOMR("0.001")).toBe(1);
    expect(parseOMR("0.1")).toBe(100);
    expect(parseOMR("300")).toBe(300000);
    expect(parseOMR("٣٠٠٫٥٠٠")).toBe(300500);
  });

  it("rejects ambiguous input instead of rounding it", () => {
    expect(parseOMR("1.2345")).toBeNull();
    expect(parseOMR("abc")).toBeNull();
    expect(parseOMR("")).toBeNull();
    expect(parseOMR("1..5")).toBeNull();
  });

  it("formats with three decimals and Western digits in both languages", () => {
    expect(formatAmount(1250750)).toBe("1,250.750");
    expect(formatOMR(1250750, "en")).toBe("OMR 1,250.750");
    expect(formatOMR(1250750, "ar")).toBe("1,250.750 ر.ع.");
    expect(formatAmount(5)).toBe("0.005");
    expect(baisaToDecimalString(1250750)).toBe("1250.750");
  });

  it("refuses non integer money", () => {
    expect(() => formatAmount(0.1 + 0.2)).toThrow();
  });

  it("applies basis points with exact half-up rounding", () => {
    expect(applyBasisPoints(500000, 500)).toBe(25000);
    expect(applyBasisPoints(1, 5000)).toBe(1); // 0.5 rounds up
    expect(applyBasisPoints(333, 500)).toBe(17); // 16.65 -> 17
    expect(applyBasisPoints(0, 500)).toBe(0);
    expect(applyBasisPoints(1250750, 0)).toBe(0);
  });

  it("parses percentages to basis points", () => {
    expect(parsePercentToBp("5")).toBe(500);
    expect(parsePercentToBp("7.25")).toBe(725);
    expect(parsePercentToBp("0")).toBe(0);
    expect(parsePercentToBp("5.123")).toBeNull();
    expect(bpToPercentString(725)).toBe("7.25");
    expect(bpToPercentString(500)).toBe("5");
  });

  it("splits a total so the parts always add up exactly", () => {
    const parts = splitEvenly(100001, 3);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100001);
    expect(parts).toEqual([33334, 33334, 33333]);
  });
});

/**
 * Money helpers. All amounts in Ijara are whole baisa integers (1 OMR = 1000 baisa).
 * No floating point arithmetic is allowed anywhere in the money path.
 */

export type Baisa = number;

export const BAISA_PER_OMR = 1000;

const ARABIC_INDIC = "٠١٢٣٤٥٦٧٨٩";
const EASTERN_ARABIC_INDIC = "۰۱۲۳۴۵۶۷۸۹";

function normaliseDigits(input: string): string {
  return input
    .replace(/[٠-٩]/g, (d) => String(ARABIC_INDIC.indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String(EASTERN_ARABIC_INDIC.indexOf(d)))
    .replace(/٫/g, ".")
    .replace(/٬/g, ",");
}

/**
 * Parse a human entered OMR amount into baisa without touching floats.
 * Accepts "1,250.750", "1250.75", "1250", Arabic digits. Returns null when invalid.
 * More than 3 decimals is rejected (never silently rounded).
 */
export function parseOMR(input: string | number | null | undefined): Baisa | null {
  if (input === null || input === undefined) return null;
  let s = normaliseDigits(String(input)).trim().replace(/[\s,]/g, "");
  s = s.replace(/^OMR/i, "").replace(/OMR$/i, "");
  if (!/^-?\d+(\.\d{1,3})?$/.test(s)) return null;
  const negative = s.startsWith("-");
  if (negative) s = s.slice(1);
  const [whole, frac = ""] = s.split(".");
  const baisa = Number(whole) * BAISA_PER_OMR + Number(frac.padEnd(3, "0"));
  if (!Number.isSafeInteger(baisa)) return null;
  return negative ? -baisa : baisa;
}

export function assertBaisa(value: number): void {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`Money value must be a whole baisa integer, received ${value}`);
  }
}

/** Plain decimal string with 3 decimals, e.g. 1250750 -> "1250.750". Safe for form inputs. */
export function baisaToDecimalString(baisa: Baisa): string {
  assertBaisa(baisa);
  const negative = baisa < 0;
  const abs = Math.abs(baisa);
  const whole = Math.floor(abs / BAISA_PER_OMR);
  const frac = String(abs % BAISA_PER_OMR).padStart(3, "0");
  return `${negative ? "-" : ""}${whole}.${frac}`;
}

/** "1,250.750" with Western digits in both languages (proposal decision D6). */
export function formatAmount(baisa: Baisa): string {
  assertBaisa(baisa);
  const negative = baisa < 0;
  const abs = Math.abs(baisa);
  const whole = Math.floor(abs / BAISA_PER_OMR)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const frac = String(abs % BAISA_PER_OMR).padStart(3, "0");
  return `${negative ? "-" : ""}${whole}.${frac}`;
}

/** Currency label placement: "OMR 1,250.750" (en) and "1,250.750 ر.ع." (ar). */
export function formatOMR(baisa: Baisa, locale: "en" | "ar" = "en"): string {
  const amount = formatAmount(baisa);
  return locale === "ar" ? `${amount} ر.ع.` : `OMR ${amount}`;
}

/** Multiply by a basis point rate (1 bp = 0.01%), rounding half up (away from zero), exact via BigInt. */
export function applyBasisPoints(baisa: Baisa, basisPoints: number): Baisa {
  assertBaisa(baisa);
  if (!Number.isInteger(basisPoints)) throw new Error("Basis points must be an integer");
  const product = BigInt(baisa) * BigInt(basisPoints);
  const denom = 10000n;
  const negative = product < 0n;
  const abs = negative ? -product : product;
  const rounded = (abs * 2n + denom) / (denom * 2n);
  return Number(negative ? -rounded : rounded);
}

/** Percent string to basis points: "5" -> 500, "7.25" -> 725. Null when invalid. */
export function parsePercentToBp(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined || String(input).trim() === "") return null;
  const s = normaliseDigits(String(input)).trim().replace("%", "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

export function bpToPercentString(bp: number): string {
  const whole = Math.floor(bp / 100);
  const frac = bp % 100;
  if (frac === 0) return String(whole);
  return `${whole}.${String(frac).padStart(2, "0").replace(/0$/, "")}`;
}

/** Split a total into n parts that sum exactly to the total; the remainder goes to the first parts. */
export function splitEvenly(total: Baisa, parts: number): Baisa[] {
  assertBaisa(total);
  if (!Number.isInteger(parts) || parts < 1) throw new Error("parts must be a positive integer");
  const base = Math.floor(total / parts);
  const remainder = total - base * parts;
  return Array.from({ length: parts }, (_, i) => base + (i < remainder ? 1 : 0));
}

export function sum(values: Baisa[]): Baisa {
  return values.reduce((a, b) => a + b, 0);
}

import { parsePhoneNumberFromString } from "libphonenumber-js/min";

/**
 * Normalise any phone input to E.164 (CR-12.4). Local Omani numbers (8 digits) default to +968.
 * Returns null when the number cannot be parsed as valid.
 */
export function normalisePhone(input: string | null | undefined): string | null {
  if (!input) return null;
  const cleaned = input
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[^\d+]/g, "")
    .replace(/^00/, "+");
  const parsed = parsePhoneNumberFromString(cleaned, "OM");
  if (!parsed || !parsed.isValid()) return null;
  return parsed.number;
}

/** "+96891234567" -> "+968 9123 4567" for display. */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return "";
  const parsed = parsePhoneNumberFromString(e164);
  if (!parsed) return e164;
  if (parsed.countryCallingCode === "968") {
    const n = parsed.nationalNumber;
    return `+968 ${n.slice(0, 4)} ${n.slice(4)}`;
  }
  return parsed.formatInternational();
}

export function maskPhone(e164: string): string {
  return e164.length > 6 ? `${e164.slice(0, 4)} **** ${e164.slice(-3)}` : e164;
}

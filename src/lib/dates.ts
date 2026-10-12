/**
 * Date helpers. Ijara works on Oman calendar days (Asia/Muscat, UTC+4), Gregorian only.
 * Business dates are ISO strings "YYYY-MM-DD" and are never converted through local time.
 */

export const ORG_TIME_ZONE = "Asia/Muscat";

export type ISODate = string;

const pad = (n: number) => String(n).padStart(2, "0");

export function toISO(y: number, m: number, d: number): ISODate {
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function parseISO(date: ISODate): { y: number; m: number; d: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`Invalid ISO date: ${date}`);
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

export function isValidISO(date: string | null | undefined): date is ISODate {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const { y, m, d } = parseISO(date);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/** Today on the Oman calendar. `now` is injectable for tests. */
export function todayISO(now: Date = new Date()): ISODate {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ORG_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function hourInMuscat(now: Date = new Date()): number {
  return (
    Number(new Intl.DateTimeFormat("en-GB", { timeZone: ORG_TIME_ZONE, hour: "2-digit", hour12: false }).format(now)) %
    24
  );
}

const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export function addDays(date: ISODate, days: number): ISODate {
  const { y, m, d } = parseISO(date);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return toISO(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Add whole months, clamping the day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(date: ISODate, months: number): ISODate {
  const { y, m, d } = parseISO(date);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return toISO(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

export function diffDays(from: ISODate, to: ISODate): number {
  const a = parseISO(from);
  const b = parseISO(to);
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000);
}

/** Whole months in a contract term where the end date is inclusive (1 Jan to 31 Dec = 12). */
export function monthsBetweenInclusive(start: ISODate, end: ISODate): number {
  let months = 0;
  const limit = addDays(end, 1);
  while (addMonths(start, months + 1) <= limit) months += 1;
  return months;
}

export function startOfMonth(date: ISODate): ISODate {
  const { y, m } = parseISO(date);
  return toISO(y, m, 1);
}

export function endOfMonth(date: ISODate): ISODate {
  const { y, m } = parseISO(date);
  return toISO(y, m, daysInMonth(y, m));
}

const localeTag = (locale: "en" | "ar") => (locale === "ar" ? "ar-OM-u-nu-latn-ca-gregory" : "en-GB");

export function formatDate(date: ISODate | Date | null | undefined, locale: "en" | "ar" = "en"): string {
  if (!date) return "";
  const iso = typeof date === "string" ? date.slice(0, 10) : todayISO(date);
  const { y, m, d } = parseISO(iso);
  return new Intl.DateTimeFormat(localeTag(locale), {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function formatDateTime(value: Date | string | null | undefined, locale: "en" | "ar" = "en"): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(localeTag(locale), {
    timeZone: ORG_TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatMonthYear(date: ISODate, locale: "en" | "ar" = "en"): string {
  const { y, m } = parseISO(date);
  return new Intl.DateTimeFormat(localeTag(locale), { timeZone: "UTC", month: "long", year: "numeric" }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  );
}

/** Convert a timestamp to its Oman calendar date. */
export function muscatDateOf(value: Date): ISODate {
  return todayISO(value);
}

/** "01 Jan 2026 to 31 Dec 2026" / Arabic with the Arabic word for "to". */
export function formatRange(from: ISODate | Date | null | undefined, to: ISODate | Date | null | undefined, locale: "en" | "ar" = "en"): string {
  return `${formatDate(from, locale)} ${locale === "ar" ? "إلى" : "to"} ${formatDate(to, locale)}`;
}

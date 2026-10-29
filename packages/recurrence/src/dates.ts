// Calendar dates as "YYYY-MM-DD" strings, with no time zone attached.
// Internally a date is a day number (days since 1970-01-01), so arithmetic
// never touches the host's local time zone.

export type DateString = string;

const DAY_MS = 86_400_000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface Ymd {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
}

export function isDateString(value: unknown): value is DateString {
  if (typeof value !== "string") return false;
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

export function parseDate(value: DateString): Ymd {
  if (!isDateString(value)) throw new RangeError(`Invalid date: ${String(value)}`);
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  return { year: y, month: m, day: d };
}

export function formatDate({ year, month, day }: Ymd): DateString {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function toDayNumber(value: DateString | Ymd): number {
  const { year, month, day } = typeof value === "string" ? parseDate(value) : value;
  return Math.round(Date.UTC(year, month - 1, day) / DAY_MS);
}

export function fromDayNumber(n: number): DateString {
  const d = new Date(n * DAY_MS);
  return formatDate({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() });
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0;
}

/** 0 = Monday ... 6 = Sunday (ISO order). */
export function isoWeekday(dayNumber: number): number {
  // 1970-01-01 was a Thursday (ISO index 3).
  return (((dayNumber + 3) % 7) + 7) % 7;
}

/** Day number of the Monday that starts the week containing `dayNumber`. */
export function weekStart(dayNumber: number): number {
  return dayNumber - isoWeekday(dayNumber);
}

/** Months since year 0, so month differences are a subtraction. */
export function monthIndex(year: number, month: number): number {
  return year * 12 + (month - 1);
}

export function fromMonthIndex(index: number): { year: number; month: number } {
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** Day `day` of the month, clamped to the month's last day. */
export function clampedDate(year: number, month: number, day: number): DateString {
  return formatDate({ year, month, day: Math.min(day, daysInMonth(year, month)) });
}

export function addDays(date: DateString, days: number): DateString {
  return fromDayNumber(toDayNumber(date) + days);
}

/** Adds whole months, clamping to the last day of a shorter month (Jan 31 + 1 = Feb 28). */
export function addMonths(date: DateString, months: number): DateString {
  const { year, month, day } = parseDate(date);
  const target = fromMonthIndex(monthIndex(year, month) + months);
  return clampedDate(target.year, target.month, day);
}

export function compareDates(a: DateString, b: DateString): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function maxDate(a: DateString, b: DateString): DateString {
  return compareDates(a, b) >= 0 ? a : b;
}

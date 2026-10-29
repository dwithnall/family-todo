// Calendar-date helpers. A "civil date" is a plain 'YYYY-MM-DD' string with no
// time zone attached. ISO strings sort correctly with ordinary string comparison.

export type CivilDate = string;
export type Weekday = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU';

export const WEEKDAYS: readonly Weekday[] = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

export interface Ymd {
  y: number;
  m: number; // 1-12
  d: number; // 1-31
}

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInMonth(y: number, m: number): number {
  if (m === 2) return isLeapYear(y) ? 29 : 28;
  return m === 4 || m === 6 || m === 9 || m === 11 ? 30 : 31;
}

export function parseDate(date: CivilDate): Ymd {
  const match = DATE_RE.exec(date);
  if (!match) throw new RangeError(`Invalid date "${date}", expected YYYY-MM-DD`);
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) {
    throw new RangeError(`Invalid calendar date "${date}"`);
  }
  return { y, m, d };
}

export function formatDate({ y, m, d }: Ymd): CivilDate {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function toEpochDay({ y, m, d }: Ymd): number {
  return Math.round(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

function fromEpochDay(day: number): Ymd {
  const dt = new Date(day * MS_PER_DAY);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

export function addDays(date: CivilDate, days: number): CivilDate {
  return formatDate(fromEpochDay(toEpochDay(parseDate(date)) + days));
}

/** Whole days from a to b (positive when b is later). */
export function daysBetween(a: CivilDate, b: CivilDate): number {
  return toEpochDay(parseDate(b)) - toEpochDay(parseDate(a));
}

/** 0 = Sunday ... 6 = Saturday. */
export function weekdayIndex(date: CivilDate): number {
  const { y, m, d } = parseDate(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function weekdayOf(date: CivilDate): Weekday {
  return WEEKDAYS[weekdayIndex(date)] as Weekday;
}

/** The Monday of the week containing the date (weeks run Monday to Sunday). */
export function startOfWeek(date: CivilDate): CivilDate {
  const sinceMonday = (weekdayIndex(date) + 6) % 7;
  return addDays(date, -sinceMonday);
}

/** Months since year 0, so months can be compared and stepped with plain arithmetic. */
export function monthIndex({ y, m }: Ymd): number {
  return y * 12 + (m - 1);
}

export function fromMonthIndex(index: number): { y: number; m: number } {
  return { y: Math.floor(index / 12), m: (((index % 12) + 12) % 12) + 1 };
}

/** Add months, clamping the day to the last day of the target month (Jan 31 + 1 month = Feb 28/29). */
export function addMonthsClamped(date: CivilDate, months: number): CivilDate {
  const ymd = parseDate(date);
  const { y, m } = fromMonthIndex(monthIndex(ymd) + months);
  return formatDate({ y, m, d: Math.min(ymd.d, daysInMonth(y, m)) });
}

/** The nth (1-based) given weekday of a month, or the last one when nth is -1. Null if it does not exist. */
export function nthWeekdayOfMonth(
  y: number,
  m: number,
  weekday: Weekday,
  nth: 1 | 2 | 3 | 4 | -1,
): CivilDate | null {
  const target = WEEKDAYS.indexOf(weekday);
  const total = daysInMonth(y, m);
  if (nth === -1) {
    const lastIdx = weekdayIndex(formatDate({ y, m, d: total }));
    const back = (lastIdx - target + 7) % 7;
    return formatDate({ y, m, d: total - back });
  }
  const firstIdx = weekdayIndex(formatDate({ y, m, d: 1 }));
  const forward = (target - firstIdx + 7) % 7;
  const day = 1 + forward + (nth - 1) * 7;
  return day <= total ? formatDate({ y, m, d: day }) : null;
}

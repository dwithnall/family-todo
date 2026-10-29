// Conversions between UTC instants and wall-clock time in an IANA time zone,
// using the platform's Intl data (available in browsers and Workers).

import { isDateString, parseDate, type DateString } from "./dates.js";

/** Wall-clock time as "HH:MM", 24-hour. */
export type TimeString = string;

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;

export function isTimeString(value: unknown): value is TimeString {
  return typeof value === "string" && TIME_RE.test(value);
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

export function isValidTimeZone(timeZone: unknown): timeZone is string {
  if (typeof timeZone !== "string" || timeZone.length === 0) return false;
  try {
    formatter(timeZone);
    return true;
  } catch {
    return false;
  }
}

/** The wall-clock reading in `timeZone` at `instant`, as a UTC-based number of ms. */
function wallMs(instant: number, timeZone: string): number {
  const parts: Record<string, number> = {};
  for (const p of formatter(timeZone).formatToParts(new Date(instant))) {
    if (p.type !== "literal") parts[p.type] = Number(p.value);
  }
  return Date.UTC(parts.year!, parts.month! - 1, parts.day!, parts.hour!, parts.minute!, parts.second!);
}

/** Offset of `timeZone` from UTC at `instant`, in ms (positive east of UTC). */
export function offsetMs(instant: number, timeZone: string): number {
  const whole = Math.floor(instant / 1000) * 1000;
  return wallMs(whole, timeZone) - whole;
}

export interface LocalDateTime {
  date: DateString;
  time: TimeString;
}

/** The local date and time in `timeZone` at a UTC instant. */
export function toLocal(instant: number, timeZone: string): LocalDateTime {
  const iso = new Date(wallMs(instant, timeZone)).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

/** Today's date in `timeZone`. `now` is passed in so callers and tests control the clock. */
export function todayIn(timeZone: string, now: number): DateString {
  return toLocal(now, timeZone).date;
}

/**
 * The UTC instant for a local date and time in `timeZone`.
 *
 * - A time skipped by a daylight saving change (for example 02:30 when clocks
 *   jump from 02:00 to 03:00) moves to the next valid time that day, the
 *   moment the clocks change (03:00).
 * - A time that happens twice (clocks going back) uses the first one.
 */
export function toInstant(date: DateString, time: TimeString, timeZone: string): number {
  if (!isDateString(date)) throw new RangeError(`Invalid date: ${String(date)}`);
  if (!isTimeString(time)) throw new RangeError(`Invalid time: ${String(time)}`);
  const { year, month, day } = parseDate(date);
  const [h, m] = time.split(":").map(Number) as [number, number];
  const wall = Date.UTC(year, month - 1, day, h, m);

  // Real zones change offset at most once in any 72 hour window.
  const before = offsetMs(wall - 36 * HOUR_MS, timeZone);
  const after = offsetMs(wall + 36 * HOUR_MS, timeZone);
  const candidates = [...new Set([wall - before, wall - after])]
    .filter((t) => wallMs(t, timeZone) === wall)
    .sort((x, y) => x - y);
  if (candidates.length > 0) return candidates[0]!;

  // In a gap. The transition lies between the two guesses: find the first
  // minute that uses the later offset.
  let lo = Math.min(wall - before, wall - after);
  let hi = Math.max(wall - before, wall - after);
  while (hi - lo > MINUTE_MS) {
    const mid = lo + Math.floor((hi - lo) / 2 / MINUTE_MS) * MINUTE_MS;
    if (offsetMs(mid, timeZone) === after) hi = mid;
    else lo = mid;
  }
  return hi;
}

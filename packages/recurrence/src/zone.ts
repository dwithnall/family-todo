import { formatDate, parseDate } from './civil.ts';
import type { CivilDate } from './civil.ts';

// Time-zone helpers. The recurrence engine works on plain calendar dates; these two
// functions connect those dates to real instants for "what is today" and reminders.

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** The wall-clock reading in a zone at an instant, expressed as if it were UTC milliseconds. */
function localAsUtc(instantMs: number, timeZone: string): number {
  const parts: Record<string, number> = {};
  for (const p of formatterFor(timeZone).formatToParts(new Date(instantMs))) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value);
  }
  return Date.UTC(parts.year!, parts.month! - 1, parts.day!, parts.hour!, parts.minute!, parts.second!);
}

/** Offset of a zone from UTC at an instant, in milliseconds (positive east of UTC). */
function offsetMs(instantMs: number, timeZone: string): number {
  return localAsUtc(instantMs, timeZone) - Math.floor(instantMs / 1000) * 1000;
}

/** The calendar date in a time zone at a given instant, for example "today" for a person. */
export function civilDateInZone(instant: Date, timeZone: string): CivilDate {
  const local = new Date(localAsUtc(instant.getTime(), timeZone));
  return formatDate({ y: local.getUTCFullYear(), m: local.getUTCMonth() + 1, d: local.getUTCDate() });
}

/**
 * The instant at which a zone's clock first reads `date` `time` ("HH:mm").
 *
 * - A time that happens twice (clocks go back) resolves to the first occurrence.
 * - A time that does not exist (clocks go forward) resolves to the moment the
 *   clocks jump, which is the next valid time that day.
 */
export function resolveLocalTime(date: CivilDate, time: string, timeZone: string): Date {
  const { y, m, d } = parseDate(date);
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) throw new RangeError(`Invalid time "${time}", expected HH:mm`);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new RangeError(`Invalid time "${time}"`);

  const wanted = Date.UTC(y, m - 1, d, hour, minute, 0);
  const DAY = 86_400_000;
  const candidates = [
    wanted - offsetMs(wanted - DAY, timeZone),
    wanted - offsetMs(wanted + DAY, timeZone),
  ];
  const valid = candidates.filter((t) => localAsUtc(t, timeZone) === wanted).sort((a, b) => a - b);
  if (valid.length > 0) return new Date(valid[0]!);

  // The wall-clock time falls inside a gap. Find the instant the clocks jump (to the minute).
  let lo = Math.min(...candidates);
  let hi = Math.max(...candidates);
  const before = offsetMs(lo, timeZone);
  while (hi - lo > 60_000) {
    const mid = lo + Math.floor((hi - lo) / 2 / 60_000) * 60_000;
    if (offsetMs(mid, timeZone) === before) lo = mid;
    else hi = mid;
  }
  return new Date(hi);
}

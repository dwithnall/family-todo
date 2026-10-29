import {
  addDays,
  addMonthsClamped,
  daysBetween,
  daysInMonth,
  formatDate,
  fromMonthIndex,
  monthIndex,
  nthWeekdayOfMonth,
  parseDate,
  startOfWeek,
  weekdayOf,
} from './civil.ts';
import type { CivilDate } from './civil.ts';
import { validateRule } from './rules.ts';
import type { FixedRule, RepeatRule } from './rules.ts';

export interface NextDueInput {
  /** The occurrence being completed (the task's current due date). */
  currentDue: CivilDate;
  /** The date the person completed it, in the task's time zone. */
  completedOn: CivilDate;
  /**
   * The date that "every N weeks/months" counts from (the task's anchor date).
   * Defaults to currentDue, which is on the schedule by construction.
   */
  anchor?: CivilDate;
  /** Occurrences already completed before this action. Only used by end.count. */
  completedCount?: number;
}

export interface SkipInput {
  currentDue: CivilDate;
  /** Today in the task's time zone. Skip jumps to the first occurrence after today. */
  today: CivilDate;
  anchor?: CivilDate;
  completedCount?: number;
}

export interface BetweenInput {
  /** The task's current due date, where the series starts. */
  currentDue: CivilDate;
  anchor?: CivilDate;
  completedCount?: number;
  /** Safety cap on the number of dates returned. */
  limit?: number;
}

function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

function maxDate(a: CivilDate, b: CivilDate): CivilDate {
  return a >= b ? a : b;
}

/** The first occurrence of a fixed rule strictly after `after`. */
function firstOccurrenceAfter(rule: FixedRule, after: CivilDate, anchor: CivilDate): CivilDate {
  switch (rule.kind) {
    case 'weekly': {
      const anchorWeek = startOfWeek(anchor);
      // A matching week comes round every `every` weeks, so this bound always finds a date.
      for (let i = 1; i <= 7 * rule.every + 7; i++) {
        const day = addDays(after, i);
        if (!rule.days.includes(weekdayOf(day))) continue;
        const weeks = daysBetween(anchorWeek, startOfWeek(day)) / 7;
        if (mod(weeks, rule.every) === 0) return day;
      }
      throw new Error('unreachable: no weekly occurrence found');
    }
    case 'monthly_day':
    case 'monthly_nth': {
      const anchorIdx = monthIndex(parseDate(anchor));
      let idx = monthIndex(parseDate(after));
      idx += mod(anchorIdx - idx, rule.every); // first month on the schedule, on or after `after`'s month
      for (let attempts = 0; attempts < 4; attempts++, idx += rule.every) {
        const { y, m } = fromMonthIndex(idx);
        let candidate: CivilDate | null;
        if (rule.kind === 'monthly_day') {
          const last = daysInMonth(y, m);
          candidate = formatDate({ y, m, d: rule.day === 'last' ? last : Math.min(rule.day, last) });
        } else {
          candidate = nthWeekdayOfMonth(y, m, rule.weekday, rule.nth === 'last' ? -1 : rule.nth);
        }
        if (candidate !== null && candidate > after) return candidate;
      }
      throw new Error('unreachable: no monthly occurrence found');
    }
    case 'yearly': {
      const startYear = parseDate(after).y;
      for (let y = startYear; y <= startYear + 1; y++) {
        // Feb 29 falls on Feb 28 in non-leap years.
        const candidate = formatDate({ y, m: rule.month, d: Math.min(rule.day, daysInMonth(y, rule.month)) });
        if (candidate > after) return candidate;
      }
      throw new Error('unreachable: no yearly occurrence found');
    }
  }
}

function stepAfterCompletion(rule: Extract<RepeatRule, { kind: 'after_completion' }>, from: CivilDate): CivilDate {
  switch (rule.unit) {
    case 'day':
      return addDays(from, rule.every);
    case 'week':
      return addDays(from, rule.every * 7);
    case 'month':
      return addMonthsClamped(from, rule.every);
  }
}

/** True when the rule's end condition stops the series after another occurrence at `next`. */
function pastEnd(rule: RepeatRule, next: CivilDate, completedCountAfter: number): boolean {
  if (rule.end?.until !== undefined && next > rule.end.until) return true;
  if (rule.end?.count !== undefined && completedCountAfter >= rule.end.count) return true;
  return false;
}

/**
 * The next due date after completing an occurrence, or null when the series has ended.
 *
 * Fixed rules: the first occurrence strictly after the later of the current due date and
 * the completion date, so completing early, on time or late never stacks missed dates.
 * After-completion rules: the completion date plus the interval.
 */
export function nextDue(rule: RepeatRule, input: NextDueInput): CivilDate | null {
  validateRule(rule);
  const { currentDue, completedOn } = input;
  const completedCountAfter = (input.completedCount ?? 0) + 1;

  const next =
    rule.kind === 'after_completion'
      ? stepAfterCompletion(rule, completedOn)
      : firstOccurrenceAfter(rule, maxDate(currentDue, completedOn), input.anchor ?? currentDue);

  return pastEnd(rule, next, completedCountAfter) ? null : next;
}

/**
 * Skip an occurrence: advance like a completion done today, but the caller writes no
 * completion record. A skipped occurrence still counts toward end.count.
 */
export function skipOccurrence(rule: RepeatRule, input: SkipInput): CivilDate | null {
  const next: NextDueInput = { currentDue: input.currentDue, completedOn: input.today };
  if (input.anchor !== undefined) next.anchor = input.anchor;
  if (input.completedCount !== undefined) next.completedCount = input.completedCount;
  return nextDue(rule, next);
}

/**
 * Occurrence dates within [from, to] (inclusive), starting from the task's current due date.
 * After-completion rules cannot predict beyond the current due date, so they return at most that one.
 */
export function occurrencesBetween(
  rule: RepeatRule,
  from: CivilDate,
  to: CivilDate,
  input: BetweenInput,
): CivilDate[] {
  validateRule(rule);
  const limit = input.limit ?? 1000;
  const anchor = input.anchor ?? input.currentDue;
  const done = input.completedCount ?? 0;
  const result: CivilDate[] = [];

  let current = input.currentDue;
  let number = done + 1; // which occurrence `current` is, counting from 1
  while (current <= to && result.length < limit) {
    if (rule.end?.until !== undefined && current > rule.end.until) break;
    if (rule.end?.count !== undefined && number > rule.end.count) break;
    if (current >= from) result.push(current);
    if (rule.kind === 'after_completion') break;
    current = firstOccurrenceAfter(rule, current, anchor);
    number++;
  }
  return result;
}

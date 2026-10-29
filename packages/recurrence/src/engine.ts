import {
  addDays,
  addMonths,
  clampedDate,
  compareDates,
  daysInMonth,
  formatDate,
  fromDayNumber,
  fromMonthIndex,
  isoWeekday,
  maxDate,
  monthIndex,
  parseDate,
  toDayNumber,
  weekStart,
  type DateString,
} from "./dates.js";
import { WEEKDAYS, isFixedRule, type AfterCompletionRule, type FixedRule, type Rule, type Weekday } from "./rules.js";

/**
 * A rule plus the date the series counts from. Weekly, monthly and yearly
 * rules use the anchor to decide which weeks, months or years are "on" when
 * `every` is above 1, and no occurrence falls before it.
 */
export interface Schedule {
  rule: Rule;
  anchor: DateString;
}

export interface AdvanceInput {
  /** The occurrence being completed or skipped. */
  currentDue: DateString;
  /** The completion (or skip) date, in the task's time zone. */
  on: DateString;
  /**
   * 1-based position of `currentDue` in the series. Needed only when the rule
   * has a `count` end: each completion or skip uses one occurrence.
   */
  occurrence?: number;
}

const weekdayIndex = (d: Weekday) => WEEKDAYS.indexOf(d);

/** Day of the Nth (1-4) or last (-1) given weekday in a month. */
export function nthWeekdayOfMonth(year: number, month: number, nth: number, weekday: Weekday): DateString {
  const target = weekdayIndex(weekday);
  if (nth === -1) {
    const last = daysInMonth(year, month);
    const lastDow = isoWeekday(toDayNumber({ year, month, day: last }));
    return formatDate({ year, month, day: last - ((lastDow - target + 7) % 7) });
  }
  const firstDow = isoWeekday(toDayNumber({ year, month, day: 1 }));
  return formatDate({ year, month, day: 1 + ((target - firstDow + 7) % 7) + 7 * (nth - 1) });
}

/** The fixed rule's candidate date in a given month (or year, for yearly rules). */
function candidateInMonth(rule: Exclude<FixedRule, { kind: "weekly" }>, year: number, month: number): DateString {
  switch (rule.kind) {
    case "monthly_day":
      return clampedDate(year, month, rule.day);
    case "monthly_nth":
      return nthWeekdayOfMonth(year, month, rule.nth, rule.weekday);
    case "yearly":
      return clampedDate(year, rule.month, rule.day);
  }
}

/**
 * First occurrence of a fixed rule that is on or after both `start` and the
 * anchor, ignoring any end. Always returns a date.
 */
function fixedOnOrAfter(rule: FixedRule, anchor: DateString, start: DateString): DateString {
  const from = maxDate(start, anchor);
  const fromDay = toDayNumber(from);

  if (rule.kind === "weekly") {
    const anchorWeek = weekStart(toDayNumber(anchor));
    const wanted = new Set(rule.days.map(weekdayIndex));
    // Any span of `every` weeks plus one week contains an "on" week's match.
    for (let d = fromDay; d < fromDay + 7 * (rule.every + 1); d++) {
      const weeksFromAnchor = (weekStart(d) - anchorWeek) / 7;
      if (weeksFromAnchor % rule.every === 0 && wanted.has(isoWeekday(d))) return fromDayNumber(d);
    }
    throw new Error("unreachable: weekly rule found no date");
  }

  const a = parseDate(anchor);
  const f = parseDate(from);

  if (rule.kind === "yearly") {
    const every = rule.every ?? 1;
    let year = f.year + ((((a.year - f.year) % every) + every) % every);
    for (;;) {
      const candidate = candidateInMonth(rule, year, rule.month);
      if (compareDates(candidate, from) >= 0) return candidate;
      year += every;
    }
  }

  const anchorMonth = monthIndex(a.year, a.month);
  const startMonth = monthIndex(f.year, f.month);
  let m = startMonth + ((((anchorMonth - startMonth) % rule.every) + rule.every) % rule.every);
  for (;;) {
    const { year, month } = fromMonthIndex(m);
    const candidate = candidateInMonth(rule, year, month);
    if (compareDates(candidate, from) >= 0) return candidate;
    m += rule.every;
  }
}

function addInterval(rule: AfterCompletionRule, date: DateString): DateString {
  switch (rule.unit) {
    case "day":
      return addDays(date, rule.every);
    case "week":
      return addDays(date, 7 * rule.every);
    case "month":
      return addMonths(date, rule.every);
  }
}

function withinEnd(rule: Rule, date: DateString, occurrence: number): boolean {
  if (rule.until !== undefined && compareDates(date, rule.until) > 0) return false;
  if (rule.count !== undefined && occurrence > rule.count) return false;
  return true;
}

/** The first due date of a new series: the first occurrence on or after the anchor. */
export function firstDue(schedule: Schedule): DateString | null {
  const { rule, anchor } = schedule;
  const date = isFixedRule(rule) ? fixedOnOrAfter(rule, anchor, anchor) : anchor;
  return withinEnd(rule, date, 1) ? date : null;
}

/**
 * The due date after completing `currentDue` on date `on`. Returns null when
 * the series has ended.
 *
 * - Fixed rules: the first occurrence strictly after the later of the current
 *   due date and the completion date, so missed occurrences are skipped, never stacked.
 * - After-completion rules: the completion date plus the interval, with month
 *   arithmetic clamped to the last day of the month.
 *
 * Time of day is not handled here: the task keeps its due time.
 */
export function nextDue(schedule: Schedule, input: AdvanceInput): DateString | null {
  const { rule, anchor } = schedule;
  if (rule.count !== undefined && input.occurrence === undefined) {
    throw new RangeError("occurrence is required for a rule with a count");
  }
  const next = isFixedRule(rule)
    ? fixedOnOrAfter(rule, anchor, addDays(maxDate(input.currentDue, input.on), 1))
    : addInterval(rule, input.on);
  return withinEnd(rule, next, (input.occurrence ?? 0) + 1) ? next : null;
}

/**
 * Skipping advances exactly like a completion. The difference is the caller's:
 * a skip writes no completion record.
 */
export const skipOccurrence = nextDue;

/**
 * Occurrences from `from` to `to`, inclusive, for the Upcoming view, capped at `limit`.
 *
 * After-completion rules cannot know the future, so they are projected from the
 * anchor as if each one were done on its due date. Pass the current due date as
 * the anchor for those.
 */
export function occurrencesBetween(schedule: Schedule, from: DateString, to: DateString, limit = 500): DateString[] {
  const { rule, anchor } = schedule;
  const out: DateString[] = [];
  if (compareDates(from, to) > 0) return out;

  // With a count end the position in the series matters, so start at the anchor.
  let occurrence = 1;
  let date: DateString | null =
    rule.count === undefined && isFixedRule(rule) ? fixedOnOrAfter(rule, anchor, from) : firstDue(schedule);
  if (date !== null && rule.count === undefined && !isFixedRule(rule)) {
    // Fast-forward an after-completion projection to the window.
    while (compareDates(date, from) < 0) date = addInterval(rule, date);
  }

  while (date !== null && compareDates(date, to) <= 0 && out.length < limit) {
    if (!withinEnd(rule, date, occurrence)) break;
    if (compareDates(date, from) >= 0) out.push(date);
    date = isFixedRule(rule) ? fixedOnOrAfter(rule, anchor, addDays(date, 1)) : addInterval(rule, date);
    occurrence++;
  }
  return out;
}

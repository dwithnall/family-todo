import { daysInMonth, WEEKDAYS } from './civil.ts';
import type { CivilDate, Weekday } from './civil.ts';

/** Optional end of a recurrence: stop after a date, or after a number of occurrences. */
export interface RuleEnd {
  until?: CivilDate;
  count?: number;
}

export interface WeeklyRule {
  kind: 'weekly';
  every: number;
  days: Weekday[];
  end?: RuleEnd;
}

export interface MonthlyDayRule {
  kind: 'monthly_day';
  every: number;
  /** Day of the month 1-31 (short months use their last day), or 'last' for the last day. */
  day: number | 'last';
  end?: RuleEnd;
}

export interface MonthlyNthRule {
  kind: 'monthly_nth';
  every: number;
  /** 1st to 4th, or 'last'. There is deliberately no 5th, so a month never lacks one. */
  nth: 1 | 2 | 3 | 4 | 'last';
  weekday: Weekday;
  end?: RuleEnd;
}

export interface YearlyRule {
  kind: 'yearly';
  month: number;
  day: number;
  end?: RuleEnd;
}

export interface AfterCompletionRule {
  kind: 'after_completion';
  every: number;
  unit: 'day' | 'week' | 'month';
  end?: RuleEnd;
}

export type RepeatRule =
  | WeeklyRule
  | MonthlyDayRule
  | MonthlyNthRule
  | YearlyRule
  | AfterCompletionRule;

export type FixedRule = Exclude<RepeatRule, AfterCompletionRule>;

function assertPositiveInt(value: unknown, name: string): void {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive whole number`);
  }
}

/** Throws RangeError when a rule (for example one parsed from stored JSON) is malformed. */
export function validateRule(rule: RepeatRule): void {
  switch (rule.kind) {
    case 'weekly':
      assertPositiveInt(rule.every, 'every');
      if (rule.days.length === 0) throw new RangeError('weekly rule needs at least one day');
      for (const day of rule.days) {
        if (!WEEKDAYS.includes(day)) throw new RangeError(`Unknown weekday "${day}"`);
      }
      break;
    case 'monthly_day':
      assertPositiveInt(rule.every, 'every');
      if (rule.day !== 'last' && (!Number.isInteger(rule.day) || rule.day < 1 || rule.day > 31)) {
        throw new RangeError('monthly day must be 1-31 or "last"');
      }
      break;
    case 'monthly_nth':
      assertPositiveInt(rule.every, 'every');
      if (![1, 2, 3, 4, 'last'].includes(rule.nth)) {
        throw new RangeError('nth must be 1, 2, 3, 4 or "last"');
      }
      if (!WEEKDAYS.includes(rule.weekday)) throw new RangeError(`Unknown weekday "${rule.weekday}"`);
      break;
    case 'yearly':
      if (!Number.isInteger(rule.month) || rule.month < 1 || rule.month > 12) {
        throw new RangeError('yearly month must be 1-12');
      }
      // 2000 is a leap year, so Feb 29 is accepted and handled at calculation time.
      if (!Number.isInteger(rule.day) || rule.day < 1 || rule.day > daysInMonth(2000, rule.month)) {
        throw new RangeError('yearly day is not valid for that month');
      }
      break;
    case 'after_completion':
      assertPositiveInt(rule.every, 'every');
      if (!['day', 'week', 'month'].includes(rule.unit)) {
        throw new RangeError('unit must be day, week or month');
      }
      break;
  }
  if (rule.end?.count !== undefined) assertPositiveInt(rule.end.count, 'end.count');
}

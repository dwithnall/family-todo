import { isDateString, type DateString } from "./dates.js";

export const WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** Optional end for a recurrence (FR-12). */
export interface RuleEnd {
  /** Last date an occurrence may fall on, inclusive. */
  until?: DateString;
  /** Total number of occurrences, counting the first one. */
  count?: number;
}

export interface WeeklyRule extends RuleEnd {
  kind: "weekly";
  every: number;
  days: Weekday[];
}

/** Day 29 to 31 falls on the last day of shorter months, so 31 means "last day of the month". */
export interface MonthlyDayRule extends RuleEnd {
  kind: "monthly_day";
  every: number;
  day: number;
}

/** nth is 1 to 4, or -1 for the last such weekday. A 5th is never offered (spec rule 6). */
export interface MonthlyNthRule extends RuleEnd {
  kind: "monthly_nth";
  every: number;
  nth: 1 | 2 | 3 | 4 | -1;
  weekday: Weekday;
}

/** Feb 29 falls on Feb 28 in non-leap years. */
export interface YearlyRule extends RuleEnd {
  kind: "yearly";
  every?: number;
  month: number;
  day: number;
}

export interface AfterCompletionRule extends RuleEnd {
  kind: "after_completion";
  every: number;
  unit: "day" | "week" | "month";
}

export type FixedRule = WeeklyRule | MonthlyDayRule | MonthlyNthRule | YearlyRule;
export type Rule = FixedRule | AfterCompletionRule;

export class InvalidRuleError extends Error {
  override name = "InvalidRuleError";
}

const MAX_EVERY = 999;

function fail(message: string): never {
  throw new InvalidRuleError(message);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function int(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    fail(`${field} must be a whole number from ${min} to ${max}`);
  }
  return value;
}

function weekday(value: unknown, field: string): Weekday {
  if (typeof value !== "string" || !(WEEKDAYS as readonly string[]).includes(value)) {
    fail(`${field} must be one of ${WEEKDAYS.join(", ")}`);
  }
  return value as Weekday;
}

function end(raw: Record<string, unknown>): RuleEnd {
  const out: RuleEnd = {};
  if (raw.until !== undefined) {
    if (!isDateString(raw.until)) fail("until must be a YYYY-MM-DD date");
    out.until = raw.until;
  }
  if (raw.count !== undefined) out.count = int(raw.count, "count", 1, 10_000);
  if (out.until !== undefined && out.count !== undefined) fail("use until or count, not both");
  return out;
}

/**
 * Checks untrusted JSON (from the client, the database or an API body) and
 * returns a clean rule with only known fields. Throws InvalidRuleError.
 */
export function parseRule(raw: unknown): Rule {
  if (!isObject(raw)) fail("rule must be an object");
  switch (raw.kind) {
    case "weekly": {
      if (!Array.isArray(raw.days) || raw.days.length === 0) fail("days must list at least one weekday");
      const days = [...new Set(raw.days.map((d, i) => weekday(d, `days[${i}]`)))];
      days.sort((a, b) => WEEKDAYS.indexOf(a) - WEEKDAYS.indexOf(b));
      return { kind: "weekly", every: int(raw.every ?? 1, "every", 1, MAX_EVERY), days, ...end(raw) };
    }
    case "monthly_day":
      return {
        kind: "monthly_day",
        every: int(raw.every ?? 1, "every", 1, MAX_EVERY),
        day: int(raw.day, "day", 1, 31),
        ...end(raw),
      };
    case "monthly_nth": {
      const nth = raw.nth;
      if (nth !== 1 && nth !== 2 && nth !== 3 && nth !== 4 && nth !== -1) fail("nth must be 1, 2, 3, 4 or -1 (last)");
      return {
        kind: "monthly_nth",
        every: int(raw.every ?? 1, "every", 1, MAX_EVERY),
        nth,
        weekday: weekday(raw.weekday, "weekday"),
        ...end(raw),
      };
    }
    case "yearly": {
      const month = int(raw.month, "month", 1, 12);
      // Feb 29 is allowed; it is clamped in non-leap years.
      const maxDay = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]!;
      return {
        kind: "yearly",
        every: int(raw.every ?? 1, "every", 1, MAX_EVERY),
        month,
        day: int(raw.day, "day", 1, maxDay),
        ...end(raw),
      };
    }
    case "after_completion": {
      const unit = raw.unit;
      if (unit !== "day" && unit !== "week" && unit !== "month") fail("unit must be day, week or month");
      return { kind: "after_completion", every: int(raw.every, "every", 1, MAX_EVERY), unit, ...end(raw) };
    }
    default:
      fail("kind must be weekly, monthly_day, monthly_nth, yearly or after_completion");
  }
}

export function isFixedRule(rule: Rule): rule is FixedRule {
  return rule.kind !== "after_completion";
}

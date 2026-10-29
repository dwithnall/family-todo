import { describe, expect, it } from "vitest";
import {
  addDays,
  firstDue,
  InvalidRuleError,
  nextDue,
  nthWeekdayOfMonth,
  occurrencesBetween,
  parseRule,
  skipOccurrence,
  toDayNumber,
  type Rule,
} from "../src/index.js";

const r = (raw: unknown): Rule => parseRule(raw);

describe("spec example table (U2 first test cases)", () => {
  // Rule | anchor | due | completed | next due
  const cases: Array<[string, unknown, string, string, string, string]> = [
    ["Weekly on Mon and Thu", { kind: "weekly", every: 1, days: ["MO", "TH"] }, "2026-10-05", "2026-10-05", "2026-10-05", "2026-10-08"],
    ["Weekly on Mon, 3 weeks late", { kind: "weekly", every: 1, days: ["MO"] }, "2026-10-05", "2026-10-05", "2026-10-26", "2026-11-02"],
    ["Every 2 weeks on Fri, anchored Oct 2", { kind: "weekly", every: 2, days: ["FR"] }, "2026-10-02", "2026-10-16", "2026-10-16", "2026-10-30"],
    ["Monthly on day 31", { kind: "monthly_day", every: 1, day: 31 }, "2027-01-31", "2027-01-31", "2027-01-31", "2027-02-28"],
    ["Monthly on 2nd Tuesday", { kind: "monthly_nth", every: 1, nth: 2, weekday: "TU" }, "2026-10-13", "2026-10-13", "2026-10-13", "2026-11-10"],
    ["Yearly on Feb 29", { kind: "yearly", month: 2, day: 29 }, "2028-02-29", "2028-02-29", "2028-02-29", "2029-02-28"],
    ["Every 10 days after completion", { kind: "after_completion", every: 10, unit: "day" }, "2027-02-01", "2027-02-01", "2027-03-03", "2027-03-13"],
    ["Every 1 month after completion", { kind: "after_completion", every: 1, unit: "month" }, "2027-01-01", "2027-01-15", "2027-01-31", "2027-02-28"],
  ];

  it.each(cases)("%s", (_name, rule, anchor, currentDue, on, expected) => {
    expect(nextDue({ rule: r(rule), anchor }, { currentDue, on })).toBe(expected);
  });
});

describe("weekly (FR-5, US-4)", () => {
  const monThu = r({ kind: "weekly", days: ["TH", "MO"] });
  const s = { rule: monThu, anchor: "2026-10-05" };

  it("completed on Thursday becomes due the next Monday", () => {
    expect(nextDue(s, { currentDue: "2026-10-08", on: "2026-10-08" })).toBe("2026-10-12");
  });

  it("completed early does not land on the same occurrence again", () => {
    expect(nextDue(s, { currentDue: "2026-10-08", on: "2026-10-06" })).toBe("2026-10-12");
  });

  it("every 2 weeks skips the off weeks", () => {
    const s2 = { rule: r({ kind: "weekly", every: 2, days: ["MO", "WE"] }), anchor: "2026-10-05" };
    expect(occurrencesBetween(s2, "2026-10-05", "2026-11-01")).toEqual([
      "2026-10-05",
      "2026-10-07",
      "2026-10-19",
      "2026-10-21",
    ]);
  });

  it("anchor mid-week starts the first on-week from the anchor", () => {
    const s3 = { rule: r({ kind: "weekly", every: 3, days: ["MO", "SU"] }), anchor: "2026-10-07" };
    expect(firstDue(s3)).toBe("2026-10-11");
    expect(nextDue(s3, { currentDue: "2026-10-11", on: "2026-10-11" })).toBe("2026-10-26");
  });
});

describe("monthly (FR-6, FR-7, US-5)", () => {
  const day31 = { rule: r({ kind: "monthly_day", day: 31 }), anchor: "2027-01-31" };

  it("day 31 falls on the last day of shorter months", () => {
    expect(occurrencesBetween(day31, "2027-01-01", "2027-06-30")).toEqual([
      "2027-01-31",
      "2027-02-28",
      "2027-03-31",
      "2027-04-30",
      "2027-05-31",
      "2027-06-30",
    ]);
  });

  it("day 31 is Feb 29 in a leap year", () => {
    expect(nextDue({ ...day31, anchor: "2028-01-31" }, { currentDue: "2028-01-31", on: "2028-01-31" })).toBe("2028-02-29");
  });

  it("clamping does not stick: after Feb 28 comes Mar 31", () => {
    expect(nextDue(day31, { currentDue: "2027-02-28", on: "2027-02-28" })).toBe("2027-03-31");
  });

  it("every 3 months follows the anchor month", () => {
    const q = { rule: r({ kind: "monthly_day", every: 3, day: 15 }), anchor: "2026-11-15" };
    expect(nextDue(q, { currentDue: "2026-11-15", on: "2026-12-20" })).toBe("2027-02-15");
  });

  it("2nd Tuesday over several months", () => {
    const s = { rule: r({ kind: "monthly_nth", nth: 2, weekday: "TU" }), anchor: "2026-10-01" };
    expect(occurrencesBetween(s, "2026-10-01", "2027-01-31")).toEqual([
      "2026-10-13",
      "2026-11-10",
      "2026-12-08",
      "2027-01-12",
    ]);
  });

  it("last Friday of the month", () => {
    expect(nthWeekdayOfMonth(2026, 10, -1, "FR")).toBe("2026-10-30");
    expect(nthWeekdayOfMonth(2027, 2, -1, "SU")).toBe("2027-02-28");
    expect(nthWeekdayOfMonth(2026, 11, 1, "SU")).toBe("2026-11-01");
    expect(nthWeekdayOfMonth(2026, 11, 4, "MO")).toBe("2026-11-23");
  });

  it("rejects a 5th weekday", () => {
    expect(() => r({ kind: "monthly_nth", nth: 5, weekday: "MO" })).toThrow(InvalidRuleError);
  });
});

describe("yearly (FR-8, US-6)", () => {
  const feb29 = { rule: r({ kind: "yearly", month: 2, day: 29 }), anchor: "2028-02-29" };

  it("Feb 29 is Feb 28 in non-leap years and Feb 29 in leap years", () => {
    expect(occurrencesBetween(feb29, "2028-01-01", "2033-12-31")).toEqual([
      "2028-02-29",
      "2029-02-28",
      "2030-02-28",
      "2031-02-28",
      "2032-02-29",
      "2033-02-28",
    ]);
  });

  it("2100 is not a leap year, 2000 was", () => {
    expect(nextDue({ ...feb29, anchor: "2096-02-29" }, { currentDue: "2096-02-29", on: "2096-02-29" })).toBe("2097-02-28");
    expect(occurrencesBetween({ ...feb29, anchor: "2099-01-01" }, "2100-01-01", "2100-12-31")).toEqual(["2100-02-28"]);
    expect(occurrencesBetween({ ...feb29, anchor: "1999-01-01" }, "2000-01-01", "2000-12-31")).toEqual(["2000-02-29"]);
  });

  it("completed late in the year still moves to next year's date", () => {
    const bday = { rule: r({ kind: "yearly", month: 6, day: 1 }), anchor: "2026-06-01" };
    expect(nextDue(bday, { currentDue: "2026-06-01", on: "2026-12-31" })).toBe("2027-06-01");
  });

  it("every 2 years follows the anchor year", () => {
    const s = { rule: r({ kind: "yearly", every: 2, month: 3, day: 1 }), anchor: "2027-03-01" };
    expect(nextDue(s, { currentDue: "2027-03-01", on: "2027-03-01" })).toBe("2029-03-01");
  });
});

describe("after completion (FR-9, US-7)", () => {
  const every10 = { rule: r({ kind: "after_completion", every: 10, unit: "day" }), anchor: "2027-03-01" };

  it("counts from the completion date whether early or late", () => {
    expect(nextDue(every10, { currentDue: "2027-03-20", on: "2027-03-03" })).toBe("2027-03-13");
    expect(nextDue(every10, { currentDue: "2027-02-20", on: "2027-03-03" })).toBe("2027-03-13");
  });

  it("weeks and months", () => {
    const w = { rule: r({ kind: "after_completion", every: 2, unit: "week" }), anchor: "2027-01-01" };
    expect(nextDue(w, { currentDue: "2027-01-01", on: "2027-01-05" })).toBe("2027-01-19");
    const m = { rule: r({ kind: "after_completion", every: 1, unit: "month" }), anchor: "2028-01-01" };
    expect(nextDue(m, { currentDue: "2028-01-01", on: "2028-01-31" })).toBe("2028-02-29");
    expect(nextDue(m, { currentDue: "2028-01-01", on: "2028-12-31" })).toBe("2029-01-31");
  });

  it("projects the Upcoming view from the current due date", () => {
    expect(occurrencesBetween({ ...every10, anchor: "2027-03-13" }, "2027-03-01", "2027-04-10")).toEqual([
      "2027-03-13",
      "2027-03-23",
      "2027-04-02",
    ]);
  });
});

describe("missed repeats are skipped, never stacked (FR-10, US-8)", () => {
  it("a weekly task 3 weeks overdue moves to the next future occurrence only", () => {
    const s = { rule: r({ kind: "weekly", days: ["WE"] }), anchor: "2026-10-07" };
    const next = nextDue(s, { currentDue: "2026-10-07", on: "2026-10-29" });
    expect(next).toBe("2026-11-04");
  });

  it("completing on an occurrence day moves past that day", () => {
    const s = { rule: r({ kind: "weekly", days: ["TH"] }), anchor: "2026-10-01" };
    expect(nextDue(s, { currentDue: "2026-10-01", on: "2026-10-29" })).toBe("2026-11-05");
  });
});

describe("skip (FR-11, US-9)", () => {
  it("advances exactly like a completion", () => {
    const s = { rule: r({ kind: "weekly", days: ["MO", "TH"] }), anchor: "2026-10-05" };
    expect(skipOccurrence(s, { currentDue: "2026-10-05", on: "2026-10-04" })).toBe("2026-10-08");
  });
});

describe("ends (FR-12)", () => {
  it("until is inclusive and returns null after it", () => {
    const s = { rule: r({ kind: "weekly", days: ["MO"], until: "2026-10-19" }), anchor: "2026-10-05" };
    expect(nextDue(s, { currentDue: "2026-10-12", on: "2026-10-12" })).toBe("2026-10-19");
    expect(nextDue(s, { currentDue: "2026-10-19", on: "2026-10-19" })).toBeNull();
    expect(occurrencesBetween(s, "2026-10-01", "2026-12-31")).toEqual(["2026-10-05", "2026-10-12", "2026-10-19"]);
  });

  it("count limits the number of occurrences", () => {
    const s = { rule: r({ kind: "monthly_day", day: 1, count: 3 }), anchor: "2026-11-01" };
    expect(nextDue(s, { currentDue: "2026-11-01", on: "2026-11-01", occurrence: 1 })).toBe("2026-12-01");
    expect(nextDue(s, { currentDue: "2027-01-01", on: "2027-01-01", occurrence: 3 })).toBeNull();
    expect(occurrencesBetween(s, "2026-12-01", "2027-12-31")).toEqual(["2026-12-01", "2027-01-01"]);
  });

  it("count needs the occurrence position", () => {
    const s = { rule: r({ kind: "after_completion", every: 1, unit: "day", count: 2 }), anchor: "2026-11-01" };
    expect(() => nextDue(s, { currentDue: "2026-11-01", on: "2026-11-01" })).toThrow(RangeError);
  });

  it("a series whose anchor is past its end has no first due date", () => {
    expect(firstDue({ rule: r({ kind: "weekly", days: ["MO"], until: "2026-10-01" }), anchor: "2026-10-02" })).toBeNull();
  });
});

describe("rule validation", () => {
  it.each([
    [null],
    [{ kind: "daily" }],
    [{ kind: "weekly", days: [] }],
    [{ kind: "weekly", days: ["XX"] }],
    [{ kind: "weekly", every: 0, days: ["MO"] }],
    [{ kind: "weekly", every: 1.5, days: ["MO"] }],
    [{ kind: "monthly_day", day: 32 }],
    [{ kind: "yearly", month: 2, day: 30 }],
    [{ kind: "yearly", month: 13, day: 1 }],
    [{ kind: "after_completion", every: 3, unit: "year" }],
    [{ kind: "after_completion", unit: "day" }],
    [{ kind: "weekly", days: ["MO"], until: "2026-02-30" }],
    [{ kind: "weekly", days: ["MO"], until: "2026-12-01", count: 3 }],
  ])("rejects %j", (raw) => {
    expect(() => parseRule(raw)).toThrow(InvalidRuleError);
  });

  it("strips unknown fields, sorts and de-duplicates days, and defaults every", () => {
    expect(parseRule({ kind: "weekly", days: ["TH", "MO", "TH"], extra: true })).toEqual({
      kind: "weekly",
      every: 1,
      days: ["MO", "TH"],
    });
  });
});

describe("properties", () => {
  // A small deterministic pseudo-random generator so failures reproduce.
  function rng(seed: number) {
    return () => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed / 2 ** 31;
    };
  }
  const rand = rng(42);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)]!;
  const days = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;

  function randomRule(): Rule {
    switch (pick(["weekly", "monthly_day", "monthly_nth", "yearly", "after_completion"] as const)) {
      case "weekly":
        return r({ kind: "weekly", every: 1 + Math.floor(rand() * 4), days: days.filter(() => rand() < 0.4).concat(pick(days)) });
      case "monthly_day":
        return r({ kind: "monthly_day", every: 1 + Math.floor(rand() * 6), day: 1 + Math.floor(rand() * 31) });
      case "monthly_nth":
        return r({ kind: "monthly_nth", every: 1 + Math.floor(rand() * 3), nth: pick([1, 2, 3, 4, -1]), weekday: pick(days) });
      case "yearly":
        return r({ kind: "yearly", every: 1 + Math.floor(rand() * 2), month: 1 + Math.floor(rand() * 12), day: 1 + Math.floor(rand() * 28) });
      case "after_completion":
        return r({ kind: "after_completion", every: 1 + Math.floor(rand() * 30), unit: pick(["day", "week", "month"] as const) });
    }
  }

  const base = toDayNumber("2026-01-01");
  const samples = Array.from({ length: 2000 }, () => {
    const rule = randomRule();
    const anchor = addDays("2026-01-01", Math.floor(rand() * 1500));
    return { rule, anchor, late: Math.floor(rand() * 120) - 30 };
  });

  it("the next date is after the completion, and after the current due date for fixed rules", () => {
    for (const { rule, anchor, late } of samples) {
      const s = { rule, anchor };
      const currentDue = firstDue(s)!;
      const on = addDays(currentDue, late);
      const next = nextDue(s, { currentDue, on })!;
      expect(typeof next).toBe("string");
      expect(toDayNumber(next)).toBeGreaterThan(toDayNumber(on));
      if (rule.kind !== "after_completion") {
        expect(toDayNumber(next)).toBeGreaterThan(toDayNumber(currentDue));
        // It is an actual occurrence of the rule, and no occurrence was skipped
        // between the later of due and completion and the result.
        const window = occurrencesBetween(s, addDays(on > currentDue ? on : currentDue, 1), next);
        expect(window).toEqual([next]);
      }
      expect(toDayNumber(next)).toBeGreaterThan(base - 1);
    }
  });

  it("occurrences are strictly increasing and never before the anchor", () => {
    for (const { rule, anchor } of samples.slice(0, 300)) {
      const list = occurrencesBetween({ rule, anchor }, "2025-01-01", "2031-12-31");
      for (let i = 1; i < list.length; i++) expect(list[i]! > list[i - 1]!).toBe(true);
      if (list.length > 0) expect(list[0]! >= anchor).toBe(true);
    }
  });
});

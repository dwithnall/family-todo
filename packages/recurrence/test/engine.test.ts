import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { weekdayOf } from '../src/civil.ts';
import { nextDue, occurrencesBetween, skipOccurrence, validateRule } from '../src/index.ts';
import type { RepeatRule } from '../src/index.ts';

// The table from docs/aidlc/spec.md ("These examples become the first test cases for U2").
describe('spec example table', () => {
  const cases: Array<{
    name: string;
    rule: RepeatRule;
    due: string;
    completed: string;
    next: string;
    anchor?: string;
  }> = [
    {
      name: 'weekly Mon and Thu, completed on the day',
      rule: { kind: 'weekly', every: 1, days: ['MO', 'TH'] },
      due: '2026-10-05',
      completed: '2026-10-05',
      next: '2026-10-08',
    },
    {
      name: 'weekly Mon, completed 3 weeks late shows only the next future Monday',
      rule: { kind: 'weekly', every: 1, days: ['MO'] },
      due: '2026-10-05',
      completed: '2026-10-26',
      next: '2026-11-02',
    },
    {
      name: 'every 2 weeks on Fri, anchored Oct 2',
      rule: { kind: 'weekly', every: 2, days: ['FR'] },
      due: '2026-10-16',
      completed: '2026-10-16',
      next: '2026-10-30',
      anchor: '2026-10-02',
    },
    {
      name: 'monthly on day 31 falls on Feb 28',
      rule: { kind: 'monthly_day', every: 1, day: 31 },
      due: '2027-01-31',
      completed: '2027-01-31',
      next: '2027-02-28',
    },
    {
      name: 'monthly on the 2nd Tuesday',
      rule: { kind: 'monthly_nth', every: 1, nth: 2, weekday: 'TU' },
      due: '2026-10-13',
      completed: '2026-10-13',
      next: '2026-11-10',
    },
    {
      name: 'yearly on Feb 29 falls on Feb 28 in a non-leap year',
      rule: { kind: 'yearly', month: 2, day: 29 },
      due: '2028-02-29',
      completed: '2028-02-29',
      next: '2029-02-28',
    },
    {
      name: 'every 10 days after completion',
      rule: { kind: 'after_completion', every: 10, unit: 'day' },
      due: '2027-03-01',
      completed: '2027-03-03',
      next: '2027-03-13',
    },
    {
      name: 'every 1 month after completion, Jan 31 clamps to Feb 28',
      rule: { kind: 'after_completion', every: 1, unit: 'month' },
      due: '2027-01-20',
      completed: '2027-01-31',
      next: '2027-02-28',
    },
  ];

  for (const c of cases) {
    it(c.name, () => {
      const input = { currentDue: c.due, completedOn: c.completed, ...(c.anchor ? { anchor: c.anchor } : {}) };
      assert.equal(nextDue(c.rule, input), c.next);
    });
  }

  it('the weekdays quoted in the spec table are correct', () => {
    assert.equal(weekdayOf('2026-10-05'), 'MO');
    assert.equal(weekdayOf('2026-10-08'), 'TH');
    assert.equal(weekdayOf('2026-10-26'), 'MO');
    assert.equal(weekdayOf('2026-11-02'), 'MO');
    assert.equal(weekdayOf('2026-10-16'), 'FR');
    assert.equal(weekdayOf('2026-10-30'), 'FR');
    assert.equal(weekdayOf('2027-01-31'), 'SU');
    assert.equal(weekdayOf('2027-02-28'), 'SU');
    assert.equal(weekdayOf('2026-10-13'), 'TU');
    assert.equal(weekdayOf('2026-11-10'), 'TU');
  });
});

describe('weekly', () => {
  it('Mon and Thu completed on Thursday is due the next Monday (US-4)', () => {
    const rule: RepeatRule = { kind: 'weekly', every: 1, days: ['MO', 'TH'] };
    assert.equal(nextDue(rule, { currentDue: '2026-10-08', completedOn: '2026-10-08' }), '2026-10-12');
  });

  it('completing early does not pull the next date earlier than the following occurrence', () => {
    const rule: RepeatRule = { kind: 'weekly', every: 1, days: ['MO'] };
    // Due Mon Oct 12, done on Fri Oct 9: next is Mon Oct 19, not Mon Oct 12 again.
    assert.equal(nextDue(rule, { currentDue: '2026-10-12', completedOn: '2026-10-09' }), '2026-10-19');
  });

  it('every 2 weeks skips the off week even when the anchor is in the past', () => {
    const rule: RepeatRule = { kind: 'weekly', every: 2, days: ['MO', 'WE'] };
    const anchor = '2026-10-05'; // a Monday, so on-weeks start Oct 5, Oct 19, Nov 2
    // Wed Oct 7 is in the on-week (Oct 5); the next on-week starts Oct 19.
    assert.equal(nextDue(rule, { currentDue: '2026-10-07', completedOn: '2026-10-07', anchor }), '2026-10-19');
  });

  it('weeks run Monday to Sunday, so a Sunday task sits at the end of its week', () => {
    const rule: RepeatRule = { kind: 'weekly', every: 2, days: ['SU'] };
    const anchor = '2026-10-04'; // Sunday, week starting Mon Sep 28
    assert.equal(nextDue(rule, { currentDue: '2026-10-04', completedOn: '2026-10-04', anchor }), '2026-10-18');
  });
});

describe('monthly', () => {
  it('day 31 across short months and a leap year (US-5)', () => {
    const rule: RepeatRule = { kind: 'monthly_day', every: 1, day: 31 };
    const step = (due: string) => nextDue(rule, { currentDue: due, completedOn: due, anchor: '2028-01-31' });
    assert.equal(step('2028-01-31'), '2028-02-29');
    assert.equal(step('2028-02-29'), '2028-03-31');
    assert.equal(step('2028-03-31'), '2028-04-30');
  });

  it('last day of the month', () => {
    const rule: RepeatRule = { kind: 'monthly_day', every: 1, day: 'last' };
    assert.equal(nextDue(rule, { currentDue: '2026-10-31', completedOn: '2026-10-31' }), '2026-11-30');
    assert.equal(nextDue(rule, { currentDue: '2027-01-31', completedOn: '2027-01-31' }), '2027-02-28');
  });

  it('every 3 months counts from the anchor month', () => {
    const rule: RepeatRule = { kind: 'monthly_day', every: 3, day: 15 };
    assert.equal(
      nextDue(rule, { currentDue: '2026-10-15', completedOn: '2026-10-15', anchor: '2026-01-15' }),
      '2027-01-15',
    );
  });

  it('monthly day: completing late in a later month goes to the next on-schedule month', () => {
    const rule: RepeatRule = { kind: 'monthly_day', every: 1, day: 5 };
    // Due Oct 5, completed Dec 20: next is Jan 5, one date only.
    assert.equal(nextDue(rule, { currentDue: '2026-10-05', completedOn: '2026-12-20' }), '2027-01-05');
  });

  it('last Friday of the month', () => {
    const rule: RepeatRule = { kind: 'monthly_nth', every: 1, nth: 'last', weekday: 'FR' };
    assert.equal(nextDue(rule, { currentDue: '2026-10-30', completedOn: '2026-10-30' }), '2026-11-27');
    assert.equal(nextDue(rule, { currentDue: '2026-11-27', completedOn: '2026-11-27' }), '2026-12-25');
  });

  it('4th Thursday handles months where the 1st is a Thursday', () => {
    const rule: RepeatRule = { kind: 'monthly_nth', every: 1, nth: 4, weekday: 'TH' };
    // Oct 1 2026 is a Thursday, so the 4th Thursday is Oct 22; Nov's is Nov 26.
    assert.equal(nextDue(rule, { currentDue: '2026-09-24', completedOn: '2026-09-24' }), '2026-10-22');
    assert.equal(nextDue(rule, { currentDue: '2026-10-22', completedOn: '2026-10-22' }), '2026-11-26');
  });
});

describe('yearly', () => {
  it('Feb 29 is due Feb 29 in leap years and Feb 28 otherwise (US-6)', () => {
    const rule: RepeatRule = { kind: 'yearly', month: 2, day: 29 };
    assert.equal(nextDue(rule, { currentDue: '2027-02-28', completedOn: '2027-02-28' }), '2028-02-29');
    assert.equal(nextDue(rule, { currentDue: '2028-02-29', completedOn: '2028-02-29' }), '2029-02-28');
  });

  it('completing before this year’s date but after the due date still advances a year', () => {
    const rule: RepeatRule = { kind: 'yearly', month: 6, day: 1 };
    assert.equal(nextDue(rule, { currentDue: '2026-06-01', completedOn: '2026-12-25' }), '2027-06-01');
  });
});

describe('after completion', () => {
  it('is the same whether the task is done early or late (US-7)', () => {
    const rule: RepeatRule = { kind: 'after_completion', every: 10, unit: 'day' };
    assert.equal(nextDue(rule, { currentDue: '2027-03-20', completedOn: '2027-03-03' }), '2027-03-13');
    assert.equal(nextDue(rule, { currentDue: '2027-02-01', completedOn: '2027-03-03' }), '2027-03-13');
  });

  it('weeks and month arithmetic across a year end', () => {
    assert.equal(
      nextDue({ kind: 'after_completion', every: 2, unit: 'week' }, { currentDue: '2026-12-20', completedOn: '2026-12-28' }),
      '2027-01-11',
    );
    assert.equal(
      nextDue({ kind: 'after_completion', every: 3, unit: 'month' }, { currentDue: '2026-11-30', completedOn: '2026-11-30' }),
      '2027-02-28',
    );
  });
});

describe('skip', () => {
  it('advances to the first future occurrence without needing a completion (US-9)', () => {
    const rule: RepeatRule = { kind: 'weekly', every: 1, days: ['MO'] };
    assert.equal(skipOccurrence(rule, { currentDue: '2026-10-05', today: '2026-10-05' }), '2026-10-12');
    assert.equal(skipOccurrence(rule, { currentDue: '2026-10-05', today: '2026-10-27' }), '2026-11-02');
  });

  it('after-completion tasks restart from today', () => {
    const rule: RepeatRule = { kind: 'after_completion', every: 1, unit: 'week' };
    assert.equal(skipOccurrence(rule, { currentDue: '2026-10-01', today: '2026-10-30' }), '2026-11-06');
  });
});

describe('end conditions', () => {
  it('until: returns null once the next date would pass the end', () => {
    const rule: RepeatRule = { kind: 'weekly', every: 1, days: ['MO'], end: { until: '2026-10-12' } };
    assert.equal(nextDue(rule, { currentDue: '2026-10-05', completedOn: '2026-10-05' }), '2026-10-12');
    assert.equal(nextDue(rule, { currentDue: '2026-10-12', completedOn: '2026-10-12' }), null);
  });

  it('count: the series ends after the final occurrence is completed', () => {
    const rule: RepeatRule = { kind: 'yearly', month: 3, day: 1, end: { count: 3 } };
    const base = { currentDue: '2026-03-01', completedOn: '2026-03-01' };
    assert.equal(nextDue(rule, { ...base, completedCount: 0 }), '2027-03-01');
    assert.equal(nextDue(rule, { ...base, completedCount: 1 }), '2027-03-01');
    assert.equal(nextDue(rule, { ...base, completedCount: 2 }), null);
  });
});

describe('occurrencesBetween', () => {
  it('lists the weekly occurrences in a window, including the current due date', () => {
    const rule: RepeatRule = { kind: 'weekly', every: 1, days: ['MO', 'TH'] };
    assert.deepEqual(
      occurrencesBetween(rule, '2026-10-05', '2026-10-19', { currentDue: '2026-10-05' }),
      ['2026-10-05', '2026-10-08', '2026-10-12', '2026-10-15', '2026-10-19'],
    );
  });

  it('only returns dates inside the window', () => {
    const rule: RepeatRule = { kind: 'monthly_day', every: 1, day: 15 };
    assert.deepEqual(
      occurrencesBetween(rule, '2026-12-01', '2027-02-28', { currentDue: '2026-10-15' }),
      ['2026-12-15', '2027-01-15', '2027-02-15'],
    );
  });

  it('after-completion rules return only the current due date', () => {
    const rule: RepeatRule = { kind: 'after_completion', every: 5, unit: 'day' };
    assert.deepEqual(occurrencesBetween(rule, '2026-10-01', '2026-12-31', { currentDue: '2026-10-10' }), ['2026-10-10']);
  });

  it('respects end.until and end.count', () => {
    const until: RepeatRule = { kind: 'weekly', every: 1, days: ['MO'], end: { until: '2026-10-19' } };
    assert.deepEqual(occurrencesBetween(until, '2026-10-01', '2026-12-31', { currentDue: '2026-10-05' }), [
      '2026-10-05',
      '2026-10-12',
      '2026-10-19',
    ]);
    const count: RepeatRule = { kind: 'weekly', every: 1, days: ['MO'], end: { count: 3 } };
    // Already completed 1, so the current due date is occurrence 2 and only 2 and 3 remain.
    assert.deepEqual(
      occurrencesBetween(count, '2026-10-01', '2026-12-31', { currentDue: '2026-10-12', completedCount: 1 }),
      ['2026-10-12', '2026-10-19'],
    );
  });

  it('stops at the safety limit', () => {
    const rule: RepeatRule = { kind: 'weekly', every: 1, days: ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] };
    assert.equal(occurrencesBetween(rule, '2026-01-01', '2100-01-01', { currentDue: '2026-01-01', limit: 50 }).length, 50);
  });
});

describe('validation', () => {
  it('rejects malformed rules', () => {
    const bad: RepeatRule[] = [
      { kind: 'weekly', every: 0, days: ['MO'] },
      { kind: 'weekly', every: 1, days: [] },
      { kind: 'monthly_day', every: 1, day: 32 },
      { kind: 'monthly_nth', every: 1, nth: 5 as never, weekday: 'MO' },
      { kind: 'yearly', month: 2, day: 30 },
      { kind: 'yearly', month: 13, day: 1 },
      { kind: 'after_completion', every: 1.5, unit: 'day' },
      { kind: 'weekly', every: 1, days: ['MO'], end: { count: 0 } },
    ];
    for (const rule of bad) assert.throws(() => validateRule(rule), RangeError, JSON.stringify(rule));
  });

  it('rejects invalid dates', () => {
    const rule: RepeatRule = { kind: 'weekly', every: 1, days: ['MO'] };
    assert.throws(() => nextDue(rule, { currentDue: '2026-02-30', completedOn: '2026-02-28' }), RangeError);
    assert.throws(() => nextDue(rule, { currentDue: '2026-2-3', completedOn: '2026-02-28' }), RangeError);
  });

  it('accepts every rule from the spec JSON examples', () => {
    const specRules: RepeatRule[] = [
      { kind: 'weekly', every: 1, days: ['MO', 'TH'] },
      { kind: 'monthly_day', every: 1, day: 31 },
      { kind: 'monthly_nth', every: 1, nth: 2, weekday: 'TU' },
      { kind: 'yearly', month: 2, day: 29 },
      { kind: 'after_completion', every: 10, unit: 'day' },
    ];
    for (const rule of specRules) validateRule(rule);
  });
});

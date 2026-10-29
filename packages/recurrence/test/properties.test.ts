import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { addDays } from '../src/civil.ts';
import { nextDue, occurrencesBetween } from '../src/index.ts';
import type { RepeatRule, Weekday } from '../src/index.ts';

// Deterministic pseudo-random generator (mulberry32) so failures are reproducible.
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAYS: Weekday[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

function randomRule(rand: () => number): RepeatRule {
  const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  switch (int(0, 4)) {
    case 0: {
      const days = DAYS.filter(() => rand() < 0.4);
      return { kind: 'weekly', every: int(1, 6), days: days.length ? days : ['MO'] };
    }
    case 1:
      return { kind: 'monthly_day', every: int(1, 12), day: rand() < 0.15 ? 'last' : int(1, 31) };
    case 2:
      return {
        kind: 'monthly_nth',
        every: int(1, 6),
        nth: ([1, 2, 3, 4, 'last'] as const)[int(0, 4)]!,
        weekday: DAYS[int(0, 6)]!,
      };
    case 3: {
      const month = int(1, 12);
      return { kind: 'yearly', month, day: int(1, month === 2 ? 29 : 28) };
    }
    default:
      return { kind: 'after_completion', every: int(1, 60), unit: (['day', 'week', 'month'] as const)[int(0, 2)]! };
  }
}

describe('property checks', () => {
  const rand = rng(20261030);
  const start = '2024-01-01';

  it('next date is exactly one valid date, after the completion, and after the due date for fixed rules', () => {
    for (let i = 0; i < 3000; i++) {
      const rule = randomRule(rand);
      const due = addDays(start, Math.floor(rand() * 1500));
      const completed = addDays(due, Math.floor(rand() * 120) - 30); // from 30 days early to 90 late
      const next = nextDue(rule, { currentDue: due, completedOn: completed, anchor: addDays(due, -7 * Math.floor(rand() * 20)) });
      const label = `${JSON.stringify(rule)} due=${due} completed=${completed}`;
      assert.ok(typeof next === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(next), `valid date for ${label}`);
      assert.ok(next > completed, `after completion for ${label}: ${next}`);
      if (rule.kind !== 'after_completion') {
        assert.ok(next > due, `after due date for ${label}: ${next}`);
      }
    }
  });

  it('is idempotent: the same inputs give the same answer, and the result is never in the past of the completion', () => {
    for (let i = 0; i < 500; i++) {
      const rule = randomRule(rand);
      const due = addDays(start, Math.floor(rand() * 800));
      const input = { currentDue: due, completedOn: addDays(due, Math.floor(rand() * 40)) };
      assert.equal(nextDue(rule, input), nextDue(rule, input));
    }
  });

  it('occurrences are strictly increasing, and nextDue steps through the same series', () => {
    for (let i = 0; i < 300; i++) {
      const rule = randomRule(rand);
      if (rule.kind === 'after_completion') continue;
      const due = addDays(start, Math.floor(rand() * 800));
      const anchor = due;
      const list = occurrencesBetween(rule, due, addDays(due, 900), { currentDue: due, anchor });
      assert.equal(list[0], due);
      for (let k = 1; k < list.length; k++) {
        assert.ok(list[k]! > list[k - 1]!, `increasing for ${JSON.stringify(rule)}`);
        // Completing each occurrence on its due date lands on the next one in the list.
        assert.equal(nextDue(rule, { currentDue: list[k - 1]!, completedOn: list[k - 1]!, anchor }), list[k]);
      }
    }
  });

  it('a task completed many periods late yields one next date, not a backlog', () => {
    for (let i = 0; i < 300; i++) {
      const rule = randomRule(rand);
      if (rule.kind === 'after_completion') continue;
      const due = addDays(start, Math.floor(rand() * 300));
      const completed = addDays(due, 200 + Math.floor(rand() * 400));
      const next = nextDue(rule, { currentDue: due, completedOn: completed, anchor: due });
      assert.ok(next !== null && next > completed);
      // Nothing from the series lies between the completion date and the returned date.
      const between = occurrencesBetween(rule, addDays(completed, 1), addDays(next, -1), { currentDue: due, anchor: due });
      assert.deepEqual(between, [], `no skipped-over occurrence for ${JSON.stringify(rule)}`);
    }
  });
});

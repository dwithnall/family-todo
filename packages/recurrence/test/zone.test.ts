import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { civilDateInZone, resolveLocalTime } from '../src/index.ts';

describe('civilDateInZone', () => {
  it('gives the local calendar date, which can differ from the UTC date', () => {
    const instant = new Date('2026-10-29T20:30:00Z');
    assert.equal(civilDateInZone(instant, 'UTC'), '2026-10-29');
    assert.equal(civilDateInZone(instant, 'Australia/Brisbane'), '2026-10-30'); // UTC+10, no DST
    assert.equal(civilDateInZone(instant, 'America/Los_Angeles'), '2026-10-29');
  });
});

describe('resolveLocalTime', () => {
  it('ordinary times', () => {
    assert.equal(resolveLocalTime('2026-10-30', '09:00', 'Australia/Brisbane').toISOString(), '2026-10-29T23:00:00.000Z');
    assert.equal(resolveLocalTime('2026-07-01', '12:00', 'America/New_York').toISOString(), '2026-07-01T16:00:00.000Z');
  });

  it('a time that does not exist moves to the moment clocks jump (New York, spring forward)', () => {
    // 2027-03-14: 02:00 EST jumps to 03:00 EDT, so 02:30 does not exist. 03:00 EDT is 07:00Z.
    assert.equal(resolveLocalTime('2027-03-14', '02:30', 'America/New_York').toISOString(), '2027-03-14T07:00:00.000Z');
  });

  it('a time that does not exist moves to the moment clocks jump (Sydney, spring forward)', () => {
    // 2026-10-04: 02:00 AEST jumps to 03:00 AEDT. 03:00 AEDT (UTC+11) is 16:00Z the day before.
    assert.equal(resolveLocalTime('2026-10-04', '02:30', 'Australia/Sydney').toISOString(), '2026-10-03T16:00:00.000Z');
  });

  it('a time that happens twice resolves to the first occurrence (New York, fall back)', () => {
    // 2026-11-01: 02:00 EDT falls back to 01:00 EST, so 01:30 happens twice. The first is EDT (UTC-4).
    assert.equal(resolveLocalTime('2026-11-01', '01:30', 'America/New_York').toISOString(), '2026-11-01T05:30:00.000Z');
  });

  it('times just either side of a gap are unaffected', () => {
    assert.equal(resolveLocalTime('2027-03-14', '01:59', 'America/New_York').toISOString(), '2027-03-14T06:59:00.000Z');
    assert.equal(resolveLocalTime('2027-03-14', '03:00', 'America/New_York').toISOString(), '2027-03-14T07:00:00.000Z');
  });

  it('rejects malformed times', () => {
    assert.throws(() => resolveLocalTime('2026-10-30', '9:00', 'UTC'), RangeError);
    assert.throws(() => resolveLocalTime('2026-10-30', '24:00', 'UTC'), RangeError);
  });
});

import { inTimeZone } from '../support/time-zone';

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  addDays,
  atMinutes,
  defaultSearchWindow,
  formatMinutes,
  formatRange,
  formatTime,
  isSameDay,
  shortDateLabel,
  startOfDay,
  weekdayLabel,
} from '../../src/utils/date-time';

// All local times below are Europe/Copenhagen (see support/time-zone.ts):
// UTC+2 in summer time (CEST), UTC+1 in winter time (CET).
const HOUR = 60 * 60 * 1000;

describe('formatting', () => {
  test('formatMinutes pads hours and minutes', () => {
    assert.equal(formatMinutes(0), '00:00');
    assert.equal(formatMinutes(9 * 60 + 5), '09:05');
    assert.equal(formatMinutes(22 * 60), '22:00');
  });

  test('formatTime uses local time', () => {
    assert.equal(formatTime(new Date(2026, 9, 20, 13, 30)), '13:30');
  });

  test('shortDateLabel and weekdayLabel are Danish', () => {
    const tuesday = new Date(2026, 9, 20);
    assert.equal(shortDateLabel(tuesday), '20. okt');
    assert.equal(weekdayLabel(tuesday, tuesday), 'I dag');
    assert.equal(weekdayLabel(addDays(tuesday, 1), tuesday), 'I morgen');
    assert.equal(weekdayLabel(addDays(tuesday, 2), tuesday), 'Tor');
    assert.equal(weekdayLabel(addDays(tuesday, -1), tuesday), 'Man');
  });

  test('formatRange', () => {
    const day = new Date(2026, 9, 20);
    assert.equal(formatRange(atMinutes(day, 9 * 60), atMinutes(day, 10 * 60 + 30)), 'Tir 20. okt, 09:00–10:30');
  });
});

describe('day arithmetic', () => {
  test('startOfDay resets to local midnight without mutating the input', () => {
    const input = new Date(2026, 9, 20, 15, 45, 12, 500);
    const result = startOfDay(input);
    assert.deepEqual(result, new Date(2026, 9, 20));
    assert.equal(input.getHours(), 15);
  });

  test('isSameDay compares local calendar days', () => {
    assert.ok(isSameDay(new Date(2026, 9, 20, 0, 0), new Date(2026, 9, 20, 23, 59)));
    assert.ok(!isSameDay(new Date(2026, 9, 20, 23, 59), new Date(2026, 9, 21, 0, 0)));
  });

  test('addDays rolls over month and year boundaries', () => {
    assert.deepEqual(addDays(new Date(2026, 9, 31), 1), new Date(2026, 10, 1));
    assert.deepEqual(addDays(new Date(2026, 11, 31), 1), new Date(2027, 0, 1));
  });

  test('addDays keeps local midnight across the October DST change (a 25-hour day)', () => {
    const dstEndDay = new Date(2026, 9, 25);
    const next = addDays(dstEndDay, 1);
    assert.equal(next.getHours(), 0);
    assert.equal(next.getDate(), 26);
    assert.equal(next.getTime() - dstEndDay.getTime(), 25 * HOUR);
  });
});

describe('local time to UTC (what the API receives)', () => {
  test('summer time: 09:00 in Copenhagen is 07:00 UTC', () => {
    assert.equal(atMinutes(new Date(2026, 9, 20), 9 * 60).toISOString(), '2026-10-20T07:00:00.000Z');
  });

  test('winter time: 09:00 in Copenhagen is 08:00 UTC', () => {
    assert.equal(atMinutes(new Date(2026, 10, 2), 9 * 60).toISOString(), '2026-11-02T08:00:00.000Z');
  });

  test('atMinutes ignores the time part of the given day', () => {
    assert.deepEqual(atMinutes(new Date(2026, 9, 20, 17, 42), 9 * 60 + 30), new Date(2026, 9, 20, 9, 30));
  });

  test('on the March DST day a 09:00–10:00 meeting is still exactly one hour', () => {
    const day = new Date(2026, 2, 29);
    const start = atMinutes(day, 9 * 60);
    const end = atMinutes(day, 10 * 60);
    assert.equal(start.toISOString(), '2026-03-29T07:00:00.000Z');
    assert.equal(end.getTime() - start.getTime(), HOUR);
  });

  test('on the October DST day a 09:00–10:00 meeting is still exactly one hour', () => {
    const day = new Date(2026, 9, 25);
    const start = atMinutes(day, 9 * 60);
    const end = atMinutes(day, 10 * 60);
    assert.equal(start.toISOString(), '2026-10-25T08:00:00.000Z');
    assert.equal(end.getTime() - start.getTime(), HOUR);
  });

  test('the conversion follows the device time zone', () => {
    const day = new Date(2026, 9, 20);
    assert.equal(
      inTimeZone('America/New_York', () => atMinutes(new Date(2026, 9, 20), 9 * 60).toISOString()),
      '2026-10-20T13:00:00.000Z',
    );
    assert.equal(
      inTimeZone('UTC', () => atMinutes(new Date(2026, 9, 20), 9 * 60).toISOString()),
      '2026-10-20T09:00:00.000Z',
    );
    // Back in the default zone.
    assert.equal(atMinutes(day, 9 * 60).toISOString(), '2026-10-20T07:00:00.000Z');
  });

  test('UTC timestamps from the API are shown in local time', () => {
    const start = new Date('2026-10-20T07:00:00Z');
    const end = new Date('2026-10-20T08:00:00Z');
    assert.equal(formatRange(start, end), 'Tir 20. okt, 09:00–10:00');
  });
});

describe('defaultSearchWindow', () => {
  const cases: { now: Date; expected: { day: Date; startMinutes: number; endMinutes: number }; why: string }[] = [
    {
      now: new Date(2026, 9, 20, 10, 5),
      expected: { day: new Date(2026, 9, 20), startMinutes: 10 * 60 + 30, endMinutes: 11 * 60 + 30 },
      why: 'rounds up to the next half hour',
    },
    {
      now: new Date(2026, 9, 20, 10, 30),
      expected: { day: new Date(2026, 9, 20), startMinutes: 11 * 60, endMinutes: 12 * 60 },
      why: 'skips the slot that is starting right now',
    },
    {
      now: new Date(2026, 9, 20, 5, 0),
      expected: { day: new Date(2026, 9, 20), startMinutes: 9 * 60, endMinutes: 10 * 60 },
      why: 'suggests 09:00 before opening hours',
    },
    {
      now: new Date(2026, 9, 20, 20, 59),
      expected: { day: new Date(2026, 9, 20), startMinutes: 21 * 60, endMinutes: 22 * 60 },
      why: 'last hour that still ends by 22:00',
    },
    {
      now: new Date(2026, 9, 20, 21, 0),
      expected: { day: new Date(2026, 9, 21), startMinutes: 9 * 60, endMinutes: 10 * 60 },
      why: 'moves to tomorrow when no full hour is left',
    },
    {
      now: new Date(2026, 9, 31, 23, 50),
      expected: { day: new Date(2026, 10, 1), startMinutes: 9 * 60, endMinutes: 10 * 60 },
      why: 'tomorrow can be in the next month',
    },
  ];

  for (const { now, expected, why } of cases) {
    test(`${formatTime(now)} → ${why}`, () => {
      assert.deepEqual(defaultSearchWindow(now), expected);
    });
  }
});

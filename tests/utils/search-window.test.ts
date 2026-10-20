import { inTimeZone } from '../support/time-zone';

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { SearchWindow } from '../../src/models/search-criteria';
import { atMinutes, defaultSearchWindow, weekdayLabel } from '../../src/utils/date-time';
import { checkSearchWindow, describeStartedWindow, hasStarted, resolveSearchWindow } from '../../src/utils/search-window';

// Local times are Europe/Copenhagen (see support/time-zone.ts). 20 October
// 2026 is a Tuesday.
const HOUR = 60 * 60 * 1000;
const at = (hours: number, minutes = 0, seconds = 0) => new Date(2026, 9, 20, hours, minutes, seconds);
const window = (day: Date, start: string, end: string): SearchWindow => ({
  day,
  startMinutes: toMinutes(start),
  endMinutes: toMinutes(end),
});
function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

describe('initial default time', () => {
  test('just before a half hour: the half hour that is about to start', () => {
    assert.deepEqual(resolveSearchWindow(null, at(9, 29, 59)), window(at(0), '09:30', '10:30'));
  });

  test('exactly on a half hour: the next one, since this one has started', () => {
    assert.deepEqual(resolveSearchWindow(null, at(9, 30)), window(at(0), '10:00', '11:00'));
  });

  test('just after a half hour: the next one', () => {
    assert.deepEqual(resolveSearchWindow(null, at(9, 30, 10)), window(at(0), '10:00', '11:00'));
  });

  test('the default is one hour long and starts on a 30-minute step', () => {
    for (let minutes = 6 * 60; minutes < 21 * 60; minutes += 7) {
      const result = resolveSearchWindow(null, at(0, minutes));
      assert.equal(result.endMinutes - result.startMinutes, 60);
      assert.equal(result.startMinutes % 30, 0);
    }
  });
});

describe('the default follows the clock until the user chooses', () => {
  test('opened at 09:30 and left open until 11:43: shows 12:00–13:00, not 10:00–11:00', () => {
    assert.deepEqual(resolveSearchWindow(null, at(9, 30, 10)), window(at(0), '10:00', '11:00'));
    assert.deepEqual(resolveSearchWindow(null, at(11, 43)), window(at(0), '12:00', '13:00'));
  });

  test('the automatic default never counts as passed', () => {
    for (let minutes = 0; minutes < 24 * 60; minutes += 1) {
      const now = at(0, minutes);
      assert.equal(checkSearchWindow(resolveSearchWindow(null, now), now), null, `at minute ${minutes}`);
    }
  });

  test('a chosen day or time is returned unchanged, also once it has passed', () => {
    const chosen = window(at(0), '10:00', '11:30');
    for (const now of [at(9), at(10), at(11, 43), new Date(2026, 9, 21, 8)]) {
      assert.equal(resolveSearchWindow(chosen, now), chosen);
    }
  });
});

describe('a chosen time that has passed', () => {
  const chosen = window(at(0), '10:00', '11:30');

  test('is valid until the start minute and passed from then on', () => {
    assert.equal(hasStarted(chosen, new Date(at(10).getTime() - 1)), false);
    assert.equal(checkSearchWindow(chosen, new Date(at(10).getTime() - 1)), null);
    assert.equal(hasStarted(chosen, at(10)), true);
  });

  test('explains what passed and suggests the next time with the same duration', () => {
    assert.deepEqual(checkSearchWindow(chosen, at(10, 5)), {
      message: 'Starttidspunktet 10:00 i dag er passeret.',
      suggestion: window(at(0), '10:30', '12:00'),
      suggestionLabel: 'I dag 10:30–12:00',
    });
  });

  test('a day chosen yesterday is reported as passed after midnight', () => {
    const tuesdayEvening = window(at(0), '21:00', '22:00');
    const wednesday = new Date(2026, 9, 21, 0, 5);
    assert.deepEqual(checkSearchWindow(tuesdayEvening, wednesday), {
      message: 'Det valgte tidspunkt, Tir 20. okt, 21:00–22:00, er passeret.',
      suggestion: window(new Date(2026, 9, 21), '09:00', '10:00'),
      suggestionLabel: 'I dag 09:00–10:00',
    });
  });

  test('a day ahead is never reported as passed', () => {
    assert.equal(checkSearchWindow(window(new Date(2026, 9, 21), '06:00', '06:30'), at(21, 59)), null);
  });
});

describe('a start rejected by the server while the device clock is behind', () => {
  test('the suggestion lies after the rejected start, never the same time again', () => {
    // The phone says 09:59:50, the server already 10:00:05.
    const rejected = window(at(0), '10:00', '11:00');
    const phoneNow = at(9, 59, 50);
    assert.equal(checkSearchWindow(rejected, phoneNow), null);
    assert.deepEqual(describeStartedWindow(rejected, phoneNow), {
      message: 'Starttidspunktet 10:00 i dag er passeret.',
      suggestion: window(at(0), '10:30', '11:30'),
      suggestionLabel: 'I dag 10:30–11:30',
    });
  });

  test('when the device clock agrees, it is the same as checkSearchWindow', () => {
    const chosen = window(at(0), '10:00', '11:00');
    assert.deepEqual(describeStartedWindow(chosen, at(10, 5)), checkSearchWindow(chosen, at(10, 5)));
  });

  test('a rejected last slot of the day suggests tomorrow morning', () => {
    assert.deepEqual(describeStartedWindow(window(at(0), '21:00', '22:00'), at(20, 59)).suggestion, window(new Date(2026, 9, 21), '09:00', '10:00'));
  });
});

describe('the last bookable interval of the day', () => {
  test('21:00–22:00 is the last default that ends by closing time (22:00)', () => {
    assert.deepEqual(resolveSearchWindow(null, at(20, 59, 59)), window(at(0), '21:00', '22:00'));
    assert.deepEqual(resolveSearchWindow(null, at(21)), window(new Date(2026, 9, 21), '09:00', '10:00'));
  });

  test('a chosen 21:30–22:00 stays valid until 21:30, then suggests tomorrow morning', () => {
    const last = window(at(0), '21:30', '22:00');
    assert.equal(checkSearchWindow(last, at(21, 29, 59)), null);
    assert.deepEqual(checkSearchWindow(last, at(21, 30)), {
      message: 'Starttidspunktet 21:30 i dag er passeret.',
      suggestion: window(new Date(2026, 9, 21), '09:00', '09:30'),
      suggestionLabel: 'I morgen 09:00–09:30',
    });
  });

  test('a half-hour meeting can still be suggested for the last half hour', () => {
    assert.deepEqual(defaultSearchWindow(at(21, 10), 30), window(at(0), '21:30', '22:00'));
  });

  test('long meetings are suggested early enough to end by 22:00', () => {
    assert.deepEqual(defaultSearchWindow(at(23), 14 * 60), window(new Date(2026, 9, 21), '08:00', '22:00'));
    assert.deepEqual(defaultSearchWindow(at(23), 16 * 60), window(new Date(2026, 9, 21), '06:00', '22:00'));
  });
});

describe('midnight', () => {
  test('a default moved to tomorrow evening stays the same day after midnight', () => {
    const evening = resolveSearchWindow(null, at(21, 30));
    const afterMidnight = resolveSearchWindow(null, new Date(2026, 9, 21, 0, 0, 1));
    assert.deepEqual(afterMidnight, evening);
  });

  test('"I morgen" becomes "I dag" when the clock passes midnight', () => {
    const wednesday = new Date(2026, 9, 21);
    assert.equal(weekdayLabel(wednesday, at(23, 59, 59)), 'I morgen');
    assert.equal(weekdayLabel(wednesday, new Date(2026, 9, 21, 0, 0, 0)), 'I dag');
    assert.equal(weekdayLabel(new Date(2026, 9, 22), new Date(2026, 9, 21, 0, 0, 0)), 'I morgen');
  });

  test('over the turn of the year', () => {
    assert.deepEqual(resolveSearchWindow(null, new Date(2026, 11, 31, 21, 45)), window(new Date(2027, 0, 1), '09:00', '10:00'));
  });
});

describe('summer and winter time', () => {
  test('the night summer time starts (29 March): 09:00 the next morning is 07:00 UTC and one hour long', () => {
    const result = resolveSearchWindow(null, new Date(2026, 2, 28, 21, 15));
    assert.deepEqual(result, window(new Date(2026, 2, 29), '09:00', '10:00'));
    const start = atMinutes(result.day, result.startMinutes);
    assert.equal(start.toISOString(), '2026-03-29T07:00:00.000Z');
    assert.equal(atMinutes(result.day, result.endMinutes).getTime() - start.getTime(), HOUR);
  });

  test('in the skipped hour (02:00–03:00 does not exist) the default is 09:00 that day', () => {
    assert.deepEqual(resolveSearchWindow(null, new Date('2026-03-29T01:30:00Z')), window(new Date(2026, 2, 29), '09:00', '10:00'));
  });

  test('in the repeated hour when winter time starts (25 October), both passes give 09:00 = 08:00 UTC', () => {
    for (const instant of ['2026-10-25T00:30:00Z', '2026-10-25T01:30:00Z']) {
      const result = resolveSearchWindow(null, new Date(instant));
      assert.deepEqual(result, window(new Date(2026, 9, 25), '09:00', '10:00'), instant);
      assert.equal(atMinutes(result.day, result.startMinutes).toISOString(), '2026-10-25T08:00:00.000Z');
    }
  });

  test('on the day winter time starts, a 10:05 default is 10:30 local time (09:30 UTC)', () => {
    const result = resolveSearchWindow(null, new Date(2026, 9, 25, 10, 5));
    assert.deepEqual(result, window(new Date(2026, 9, 25), '10:30', '11:30'));
    assert.equal(atMinutes(result.day, result.startMinutes).toISOString(), '2026-10-25T09:30:00.000Z');
  });

  test('a chosen time passes at its local start, on either side of the change', () => {
    const chosen = window(new Date(2026, 9, 25), '09:00', '10:00');
    assert.equal(hasStarted(chosen, new Date('2026-10-25T07:59:59Z')), false);
    assert.equal(hasStarted(chosen, new Date('2026-10-25T08:00:00Z')), true);
  });

  test('where summer time starts at midnight (Chile), "I dag" and the default still work', () => {
    inTimeZone('America/Santiago', () => {
      // 6 Sep 2026 starts at 01:00: 00:00–00:59 does not exist.
      const lateSaturday = new Date(2026, 8, 5, 23, 30);
      const sunday = resolveSearchWindow(null, lateSaturday).day;
      assert.equal(weekdayLabel(sunday, lateSaturday), 'I morgen');
      const sundayMorning = new Date(sunday.getTime() + 60_000);
      assert.equal(weekdayLabel(sunday, sundayMorning), 'I dag');
      assert.deepEqual(resolveSearchWindow(null, sundayMorning), { day: sunday, startMinutes: 9 * 60, endMinutes: 10 * 60 });
    });
  });
});

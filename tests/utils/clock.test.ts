import { inTimeZone } from '../support/time-zone';

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, mock, test } from 'node:test';

import { MAX_CHECK_INTERVAL_MS, clockKey, msUntilNextCheck, watchClock } from '../../src/utils/clock';
import { formatMinutes, weekdayLabel } from '../../src/utils/date-time';
import { checkSearchWindow, resolveSearchWindow } from '../../src/utils/search-window';

// Local times are Europe/Copenhagen (see support/time-zone.ts).
const SECOND = 1000;
const MINUTE = 60 * SECOND;

describe('msUntilNextCheck', () => {
  test('wakes just after the next half-hour boundary when it is less than a minute away', () => {
    assert.equal(msUntilNextCheck(new Date(2026, 9, 20, 9, 59, 30)), 30 * SECOND + 20);
    assert.equal(msUntilNextCheck(new Date(2026, 9, 20, 10, 29, 59, 990)), 10 + 20);
  });

  test('checks at least once a minute', () => {
    assert.equal(msUntilNextCheck(new Date(2026, 9, 20, 9, 30, 10)), MAX_CHECK_INTERVAL_MS);
  });

  test('wakes at midnight', () => {
    assert.equal(msUntilNextCheck(new Date(2026, 9, 20, 23, 59, 50)), 10 * SECOND + 20);
  });

  test('when summer time starts, 01:59:30 is 30 seconds before 03:00', () => {
    assert.equal(msUntilNextCheck(new Date(2026, 2, 29, 1, 59, 30)), 30 * SECOND + 20);
  });

  test('in the repeated hour when winter time starts, it falls back to the regular check', () => {
    // 02:15 on the second pass (CET); 02:30 resolves to the first pass (CEST), in the past.
    assert.equal(msUntilNextCheck(new Date('2026-10-25T01:15:00Z')), MAX_CHECK_INTERVAL_MS);
  });

  test('where midnight does not exist (Chile), it wakes when the new day starts at 01:00', () => {
    inTimeZone('America/Santiago', () => {
      assert.equal(msUntilNextCheck(new Date(2026, 8, 5, 23, 59, 30)), 30 * SECOND + 20);
    });
  });
});

describe('clockKey', () => {
  test('is the same within a half hour and changes at its end', () => {
    assert.equal(clockKey(new Date(2026, 9, 20, 10, 0)), clockKey(new Date(2026, 9, 20, 10, 29, 59)));
    assert.notEqual(clockKey(new Date(2026, 9, 20, 10, 29, 59)), clockKey(new Date(2026, 9, 20, 10, 30)));
  });

  test('changes at midnight', () => {
    assert.notEqual(clockKey(new Date(2026, 9, 20, 23, 59, 59)), clockKey(new Date(2026, 9, 21, 0, 0)));
  });

  test('tells the two passes of the repeated hour apart', () => {
    assert.notEqual(clockKey(new Date('2026-10-25T00:15:00Z')), clockKey(new Date('2026-10-25T01:15:00Z')));
  });
});

describe('watchClock', () => {
  let changes: Date[];
  let resume: (() => void) | undefined;
  let unsubscribed: boolean;
  let stop: (() => void) | undefined;

  function start(since: Date = new Date()) {
    stop = watchClock({
      since,
      onChange: (now) => changes.push(now),
      subscribeToResume: (onResume) => {
        resume = onResume;
        return () => {
          unsubscribed = true;
        };
      },
    });
  }

  /**
   * Lets `ms` pass like real time, one second at a time. A single
   * mock.timers.tick(ms) moves the clock to the end first and only then runs
   * the timers that are due, which is what being in the background is like.
   */
  const advance = (ms: number) => {
    for (let left = ms; left > 0; left -= SECOND) mock.timers.tick(Math.min(SECOND, left));
  };

  /** Local times of the reported changes, e.g. "10:00". */
  const reported = () => changes.map((now) => formatMinutes(now.getHours() * 60 + now.getMinutes()));

  beforeEach(() => {
    changes = [];
    resume = undefined;
    unsubscribed = false;
    mock.timers.enable({ apis: ['setTimeout', 'Date'], now: new Date(2026, 9, 20, 9, 30, 10) });
  });

  afterEach(() => {
    stop?.();
    stop = undefined;
    mock.timers.reset();
  });

  test('stays quiet within a half hour and reports when the next one starts', () => {
    start();
    advance(29 * MINUTE + 49 * SECOND); // 09:59:59
    assert.deepEqual(reported(), []);

    // Just after 10:00, so the new time is already past the boundary.
    advance(SECOND + 20);
    assert.deepEqual(reported(), ['10:00']);
    assert.equal(changes[0].getTime(), new Date(2026, 9, 20, 10, 0, 0, 20).getTime());
  });

  test('keeps the default time current while the app stays open (09:30 → 11:43)', () => {
    let shown = new Date();
    stop = watchClock({ since: shown, onChange: (now) => (shown = now) });

    assert.deepEqual(resolveSearchWindow(null, shown), { day: new Date(2026, 9, 20), startMinutes: 600, endMinutes: 660 });
    advance(2 * 60 * MINUTE + 13 * MINUTE - 10 * SECOND); // 11:43
    assert.deepEqual(resolveSearchWindow(null, shown), { day: new Date(2026, 9, 20), startMinutes: 720, endMinutes: 780 });
  });

  test('reports a chosen start time passing without any interaction', () => {
    let shown = new Date();
    stop = watchClock({ since: shown, onChange: (now) => (shown = now) });
    const chosen = { day: new Date(2026, 9, 20), startMinutes: 10 * 60, endMinutes: 11 * 60 };

    assert.equal(checkSearchWindow(chosen, shown), null);
    advance(30 * MINUTE);
    assert.equal(checkSearchWindow(chosen, shown)?.message, 'Starttidspunktet 10:00 i dag er passeret.');
  });

  test('reports at once when the time changed between render and start', () => {
    start(new Date(2026, 9, 20, 9, 29, 59));
    assert.deepEqual(reported(), ['09:30']);
  });

  test('checks again when the app returns from the background', () => {
    start();
    // Backgrounded: timers do not run, but the time moves on.
    mock.timers.setTime(new Date(2026, 9, 20, 11, 43).getTime());
    assert.deepEqual(changes, []);

    resume?.();
    assert.deepEqual(reported(), ['11:43']);
  });

  test('a resume within the same half hour reports nothing', () => {
    start();
    mock.timers.setTime(new Date(2026, 9, 20, 9, 45).getTime());
    resume?.();
    assert.deepEqual(changes, []);
  });

  test('timers that fire late after a resume do not report the same change twice', () => {
    start();
    mock.timers.setTime(new Date(2026, 9, 20, 11, 43).getTime());
    resume?.();
    mock.timers.tick(0); // the overdue timer
    assert.deepEqual(reported(), ['11:43']);
  });

  test('reports midnight, so "I morgen" can become "I dag"', () => {
    mock.timers.setTime(new Date(2026, 9, 20, 23, 50).getTime());
    let shown = new Date();
    stop = watchClock({ since: shown, onChange: (now) => (shown = now) });
    const wednesday = new Date(2026, 9, 21);

    assert.equal(weekdayLabel(wednesday, shown), 'I morgen');
    advance(10 * MINUTE);
    assert.equal(weekdayLabel(wednesday, shown), 'I dag');
  });

  test('reports every half hour through the night winter time starts', () => {
    mock.timers.setTime(new Date('2026-10-24T23:45:00Z').getTime()); // 01:45 CEST
    start();
    advance(3 * 60 * MINUTE);
    // Until 03:45 CET. 02:00–02:59 happens twice.
    assert.deepEqual(reported(), ['02:00', '02:30', '02:00', '02:30', '03:00', '03:30']);
  });

  test('stop() cancels the timer and the background subscription', () => {
    start();
    stop?.();
    stop = undefined;
    advance(2 * 60 * MINUTE);
    assert.deepEqual(changes, []);
    assert.equal(unsubscribed, true);
  });
});

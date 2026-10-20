// Tells the UI when the time it shows may have gone stale: when a new
// half-hour slot starts (the default window moves on, a chosen start can pass),
// when a new day starts ("I dag"/"I morgen") and when the app comes back from
// the background, where timers may not have run at all.
//
// Plain setTimeout, no native module: works the same on Android, iOS and web,
// and in Node, where the tests drive it with mocked timers.

import { SLOT_MINUTES, atMinutes } from './date-time';

/** Upper bound between checks. Also catches clock and time zone changes. */
export const MAX_CHECK_INTERVAL_MS = 60_000;
/** Wake up just after a boundary, so `new Date()` is already past it. */
const BOUNDARY_MARGIN_MS = 20;

/**
 * Identifies the local half-hour slot `now` falls in. It changes at every
 * slot boundary, at midnight and when the UTC offset changes (summer/winter
 * time, a new time zone), and stays the same in between.
 */
export function clockKey(now: Date): string {
  const slot = Math.floor((now.getHours() * 60 + now.getMinutes()) / SLOT_MINUTES);
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}/${slot}/${now.getTimezoneOffset()}`;
}

/** Milliseconds until the next check: the next local slot boundary, at most a minute away. */
export function msUntilNextCheck(now: Date): number {
  const minutes = now.getHours() * 60 + now.getMinutes();
  // 24:00 rolls over to the next local midnight.
  const boundary = atMinutes(now, (Math.floor(minutes / SLOT_MINUTES) + 1) * SLOT_MINUTES);
  const untilBoundary = boundary.getTime() - now.getTime();
  // In the hour that repeats when summer time ends, the boundary can resolve
  // to the earlier pass, which lies in the past. Fall back to the regular check.
  if (untilBoundary <= 0) return MAX_CHECK_INTERVAL_MS;
  return Math.min(MAX_CHECK_INTERVAL_MS, untilBoundary + BOUNDARY_MARGIN_MS);
}

export interface WatchClockOptions {
  /** The time the UI currently shows. A change since then is reported at once. */
  since: Date;
  /** Called with the current time whenever clockKey changes. */
  onChange: (now: Date) => void;
  /** Calls `onResume` when the app returns to the foreground; returns an unsubscribe function. */
  subscribeToResume?: (onResume: () => void) => () => void;
}

/** Starts watching the clock. Returns a function that stops it again. */
export function watchClock({ since, onChange, subscribeToResume }: WatchClockOptions): () => void {
  let lastKey = clockKey(since);
  let timer: ReturnType<typeof setTimeout> | undefined;

  const check = () => {
    const now = new Date();
    const key = clockKey(now);
    if (key !== lastKey) {
      lastKey = key;
      onChange(now);
    }
    clearTimeout(timer);
    timer = setTimeout(check, msUntilNextCheck(now));
  };

  check();
  const unsubscribe = subscribeToResume?.(check);

  return () => {
    clearTimeout(timer);
    unsubscribe?.();
  };
}

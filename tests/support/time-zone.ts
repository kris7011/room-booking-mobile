// The app converts the user's local time to UTC, so results depend on the
// machine's time zone. Pin it so tests pass the same way on a laptop in
// Denmark and on a GitHub runner (which uses UTC). Node re-reads TZ when it is
// assigned at runtime.
export const DEFAULT_TEST_TIME_ZONE = 'Europe/Copenhagen';

process.env.TZ = DEFAULT_TEST_TIME_ZONE;

/** Runs `fn` with another time zone, then restores the default. */
export function inTimeZone<T>(timeZone: string, fn: () => T): T {
  process.env.TZ = timeZone;
  try {
    return fn();
  } finally {
    process.env.TZ = DEFAULT_TEST_TIME_ZONE;
  }
}

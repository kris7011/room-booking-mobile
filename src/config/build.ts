/**
 * True only in a development bundle: Metro sets the global `__DEV__` to
 * true for `expo start` / a debug build and to false for a release bundle.
 * Read from globalThis on every call, so the Node tests can switch it.
 * Anything but an explicit true counts as production, the safe default.
 */
export function isDevelopmentBundle(): boolean {
  return (globalThis as { __DEV__?: unknown }).__DEV__ === true;
}

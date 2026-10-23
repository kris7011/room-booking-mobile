// Web (and the Node tests): the platform's crypto.randomUUID. On Android and
// iOS, Metro uses random-id.native.ts, which must export the same function.

/** A random v4 UUID, e.g. for an Idempotency-Key. */
export function newRandomId(): string {
  return globalThis.crypto.randomUUID();
}

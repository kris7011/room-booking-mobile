// Android and iOS: Hermes has no crypto.randomUUID, so expo-crypto (already
// part of the development build through expo-auth-session) provides it.
import { randomUUID } from 'expo-crypto';

/** A random v4 UUID, e.g. for an Idempotency-Key. */
export function newRandomId(): string {
  return randomUUID();
}

({ newRandomId }) satisfies typeof import('./random-id');

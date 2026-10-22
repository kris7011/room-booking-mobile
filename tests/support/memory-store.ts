import type { KeyValueStore } from '../../src/auth/session-storage';

/** A SecureStore stand-in. `failWrites`/`failReads`/`failDeletes` simulate a broken keystore. */
export class MemoryStore implements KeyValueStore {
  readonly values = new Map<string, string>();
  failWrites = false;
  failReads = false;
  failDeletes = false;

  async getItem(key: string): Promise<string | null> {
    if (this.failReads) throw new Error('keystore unavailable');
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    if (this.failWrites) throw new Error('keystore unavailable');
    if (!/^[A-Za-z0-9._-]+$/.test(key)) throw new Error(`invalid SecureStore key ${key}`);
    this.values.set(key, value);
  }

  async deleteItem(key: string): Promise<void> {
    if (this.failDeletes) throw new Error('keystore unavailable');
    this.values.delete(key);
  }

  /** Everything stored, for checking that no access token was ever written. */
  dump(): string {
    return [...this.values.values()].join('\n');
  }
}

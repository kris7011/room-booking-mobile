import type { KeyValueStore } from '../../src/auth/session-storage';

type Operation = 'get' | 'set' | 'delete';

export interface Hold {
  /** Lets the held operations (and any later ones) go ahead. */
  release(): void;
  /** Makes the held operations fail, like a broken keystore. */
  fail(): void;
}

/**
 * A SecureStore stand-in. `failWrites`/`failReads`/`failDeletes` simulate a
 * broken keystore; `hold()` stops an operation half-way, so a test can decide
 * exactly what happens while SecureStore is still busy.
 */
export class MemoryStore implements KeyValueStore {
  readonly values = new Map<string, string>();
  failWrites = false;
  failReads = false;
  failDeletes = false;
  /** How many operations of each kind are waiting at a hold right now. */
  readonly waiting: Record<Operation, number> = { get: 0, set: 0, delete: 0 };
  private readonly holds = new Map<Operation, Promise<void>>();

  hold(operation: Operation): Hold {
    let release!: () => void;
    let fail!: (error: Error) => void;
    const gate = new Promise<void>((resolve, reject) => {
      release = resolve;
      fail = reject;
    });
    // Rejections are seen by the waiting operations, not reported as unhandled.
    gate.catch(() => undefined);
    this.holds.set(operation, gate);
    return {
      release: () => {
        this.holds.delete(operation);
        release();
      },
      fail: () => {
        this.holds.delete(operation);
        fail(new Error('keystore unavailable'));
      },
    };
  }

  async getItem(key: string): Promise<string | null> {
    await this.pass('get');
    if (this.failReads) throw new Error('keystore unavailable');
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    await this.pass('set');
    if (this.failWrites) throw new Error('keystore unavailable');
    if (!/^[A-Za-z0-9._-]+$/.test(key)) throw new Error(`invalid SecureStore key ${key}`);
    this.values.set(key, value);
  }

  async deleteItem(key: string): Promise<void> {
    await this.pass('delete');
    if (this.failDeletes) throw new Error('keystore unavailable');
    this.values.delete(key);
  }

  /** Everything stored, for checking that no access token was ever written. */
  dump(): string {
    return [...this.values.values()].join('\n');
  }

  private async pass(operation: Operation): Promise<void> {
    const gate = this.holds.get(operation);
    if (!gate) return;
    this.waiting[operation]++;
    try {
      await gate;
    } finally {
      this.waiting[operation]--;
    }
  }
}

/**
 * Lets pending promise callbacks and I/O callbacks run until `condition`
 * holds. No timers are involved, so the order of steps stays the same on
 * every run; it fails instead of waiting forever.
 */
export async function until(condition: () => boolean, what: string): Promise<void> {
  for (let round = 0; round < 100; round++) {
    if (condition()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error(`Timed out waiting until ${what}`);
}

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { AuthFlowError } from '../../src/auth/auth-errors';
import type { AuthUser } from '../../src/auth/id-token';
import {
  CHUNK_LENGTH,
  MAX_CHUNKS,
  SESSION_META_KEY,
  clearSession,
  loadSession,
  refreshChunkKey,
  saveSession,
} from '../../src/auth/session-storage';
import { TEST_OBJECT_ID, TEST_TENANT_ID } from '../support/entra-fixtures';
import { MemoryStore } from '../support/memory-store';

const user: AuthUser = { provider: 'entra', name: 'Søren', username: 'soren@contoso.example', tenantId: TEST_TENANT_ID, objectId: TEST_OBJECT_ID };

describe('saving and loading', () => {
  test('a short refresh token round-trips in one chunk', async () => {
    const store = new MemoryStore();
    await saveSession(store, { refreshToken: 'fake-refresh', user });
    assert.deepEqual(await loadSession(store), { refreshToken: 'fake-refresh', user });
    assert.deepEqual([...store.values.keys()].sort(), [SESSION_META_KEY, refreshChunkKey(0)].sort());
  });

  test('a long refresh token is split into chunks below the 2 KB platform limit', async () => {
    const store = new MemoryStore();
    const refreshToken = 'r'.repeat(CHUNK_LENGTH * 2 + 5);
    await saveSession(store, { refreshToken, user });
    assert.equal(store.values.get(refreshChunkKey(2))?.length, 5);
    for (const value of store.values.values()) assert.ok(value.length <= 2048);
    assert.equal((await loadSession(store))?.refreshToken, refreshToken);
  });

  test('a shorter token replaces a longer one without leftover chunks', async () => {
    const store = new MemoryStore();
    await saveSession(store, { refreshToken: 'x'.repeat(CHUNK_LENGTH * 3), user });
    await saveSession(store, { refreshToken: 'short', user });
    assert.equal(store.values.has(refreshChunkKey(1)), false);
    assert.equal((await loadSession(store))?.refreshToken, 'short');
  });

  test('an empty or absurdly long token is refused', async () => {
    const store = new MemoryStore();
    await assert.rejects(saveSession(store, { refreshToken: '', user }), AuthFlowError);
    await assert.rejects(saveSession(store, { refreshToken: 'x'.repeat(CHUNK_LENGTH * MAX_CHUNKS + 1), user }), AuthFlowError);
  });

  test('nothing stored → null', async () => {
    assert.equal(await loadSession(new MemoryStore()), null);
  });
});

describe('damaged storage is treated as signed out and cleaned up', () => {
  test('a missing chunk', async () => {
    const store = new MemoryStore();
    await saveSession(store, { refreshToken: 'x'.repeat(CHUNK_LENGTH + 1), user });
    store.values.delete(refreshChunkKey(1));
    assert.equal(await loadSession(store), null);
    assert.equal(store.values.size, 0);
  });

  test('metadata that is not JSON or not version 1', async () => {
    for (const meta of ['{not json', JSON.stringify({ version: 2, chunks: 1, user }), JSON.stringify({ version: 1, chunks: 0, user })]) {
      const store = new MemoryStore();
      store.values.set(SESSION_META_KEY, meta);
      store.values.set(refreshChunkKey(0), 'fake-refresh');
      assert.equal(await loadSession(store), null, meta);
      assert.equal(store.values.size, 0, meta);
    }
  });

  test('an unreadable keystore is a storage error, not a crash', async () => {
    const store = new MemoryStore();
    store.failReads = true;
    await assert.rejects(loadSession(store), (error: unknown) => error instanceof AuthFlowError && error.kind === 'storage');
  });

  test('a failing write is a storage error', async () => {
    const store = new MemoryStore();
    store.failWrites = true;
    await assert.rejects(saveSession(store, { refreshToken: 'fake', user }), (error: unknown) => error instanceof AuthFlowError && error.kind === 'storage');
  });
});

test('clearSession deletes every key, even with damaged metadata', async () => {
  const store = new MemoryStore();
  await saveSession(store, { refreshToken: 'x'.repeat(CHUNK_LENGTH * 3), user });
  store.values.set(SESSION_META_KEY, 'garbage');
  await clearSession(store);
  assert.equal(store.values.size, 0);
});

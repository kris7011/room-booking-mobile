import { TEST_LOCALHOST_API_URL } from '../support/live-localhost-mode';

import assert from 'node:assert/strict';
import { afterEach, describe, mock, test } from 'node:test';

import { canSendBearerTokenToApi, setAccessTokenProvider, type AccessTokenProvider } from '../../src/api/http-client';
import { liveApi } from '../../src/api/live-api';
import { isDevelopmentBundle } from '../../src/config/build';

// The API at http://localhost:5003, as with `adb reverse` on a physical
// phone. Whether the token is sent depends only on the kind of bundle:
// a development bundle may, a release bundle never sends a token over HTTP.

const globals = globalThis as { __DEV__?: unknown };

function setBundle(kind: 'development' | 'release' | 'unknown') {
  if (kind === 'unknown') delete globals.__DEV__;
  else globals.__DEV__ = kind === 'development';
}

afterEach(() => {
  mock.restoreAll();
  setAccessTokenProvider(null);
  setBundle('unknown');
});

function trackingProvider() {
  const calls: unknown[] = [];
  const provider: AccessTokenProvider = {
    async getAccessGrant(options?: { forceRefresh?: boolean }) {
      calls.push(options);
      return { accessToken: 'fake-access-1', isCurrent: () => true };
    },
  };
  return { provider, calls };
}

function stubFetch() {
  return mock.method(globalThis, 'fetch', async () => new Response('[]', { status: 200 }));
}

function authorizationOf(fetchMock: ReturnType<typeof stubFetch>): string | undefined {
  const init = fetchMock.mock.calls[0].arguments[1] as RequestInit;
  return (init.headers as Record<string, string>).Authorization;
}

describe('isDevelopmentBundle', () => {
  test('only an explicit __DEV__ === true is development', () => {
    setBundle('development');
    assert.equal(isDevelopmentBundle(), true);
    setBundle('release');
    assert.equal(isDevelopmentBundle(), false);
    setBundle('unknown');
    assert.equal(isDevelopmentBundle(), false);
    globals.__DEV__ = 'true';
    assert.equal(isDevelopmentBundle(), false);
  });
});

describe('API on http://localhost (adb reverse)', () => {
  test('development bundle: the request carries the token', async () => {
    setBundle('development');
    const { provider } = trackingProvider();
    setAccessTokenProvider(provider);
    const fetchMock = stubFetch();

    await liveApi.getRooms();

    assert.equal(fetchMock.mock.calls[0].arguments[0], `${TEST_LOCALHOST_API_URL}/api/rooms`);
    assert.equal(authorizationOf(fetchMock), 'Bearer fake-access-1');
    assert.equal(canSendBearerTokenToApi(), true);
  });

  for (const kind of ['release', 'unknown'] as const) {
    test(`${kind} bundle: no token is sent, or even requested, and the request still works`, async () => {
      setBundle(kind);
      const { provider, calls } = trackingProvider();
      setAccessTokenProvider(provider);
      const fetchMock = stubFetch();

      assert.deepEqual(await liveApi.getRooms(), []);

      assert.equal(authorizationOf(fetchMock), undefined);
      assert.equal(calls.length, 0, 'the token must not be renewed for a request that cannot carry it');
      assert.equal(canSendBearerTokenToApi(), false);
    });
  }
});

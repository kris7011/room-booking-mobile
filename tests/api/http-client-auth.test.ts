import { TEST_HTTPS_API_URL } from '../support/live-https-mode';

import assert from 'node:assert/strict';
import { afterEach, describe, mock, test } from 'node:test';

import { classifyCurrentUserError, fetchCurrentUser } from '../../src/api/current-user';
import { describeError } from '../../src/api/error-messages';
import { ApiError, canSendBearerToken, setAccessTokenProvider, type AccessTokenProvider } from '../../src/api/http-client';
import { liveApi } from '../../src/api/live-api';
import { AuthFlowError } from '../../src/auth/auth-errors';

afterEach(() => {
  mock.restoreAll();
  setAccessTokenProvider(null);
});

function stubFetch(statuses: number[], body: unknown = []) {
  let call = 0;
  return mock.method(globalThis, 'fetch', async () => {
    const status = statuses[Math.min(call++, statuses.length - 1)];
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  });
}

function headersOf(fetchMock: ReturnType<typeof stubFetch>, index = 0): Record<string, string> {
  return (fetchMock.mock.calls[index].arguments[1] as RequestInit).headers as Record<string, string>;
}

function provider(tokens: (string | null)[]): AccessTokenProvider & { calls: ({ forceRefresh?: boolean } | undefined)[] } {
  const calls: ({ forceRefresh?: boolean } | undefined)[] = [];
  return {
    calls,
    async getAccessToken(options) {
      calls.push(options);
      return tokens[Math.min(calls.length - 1, tokens.length - 1)];
    },
  };
}

describe('Authorization header', () => {
  test('without a provider nothing changes: no Authorization header', async () => {
    const fetchMock = stubFetch([200]);
    await liveApi.getRooms();
    assert.deepEqual(headersOf(fetchMock), { Accept: 'application/json' });
  });

  test('nobody signed in (null) → no Authorization header', async () => {
    setAccessTokenProvider(provider([null]));
    const fetchMock = stubFetch([200]);
    await liveApi.getRooms();
    assert.equal(headersOf(fetchMock).Authorization, undefined);
  });

  test('signed in → every request carries the bearer token from the one provider', async () => {
    setAccessTokenProvider(provider(['fake-access-1']));
    const fetchMock = stubFetch([201], { id: 1 });
    await liveApi.createBooking({ roomId: 1, title: 't', bookedBy: 'b', startUtc: 'x', endUtc: 'y' });
    assert.deepEqual(headersOf(fetchMock), {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: 'Bearer fake-access-1',
    });
  });
});

describe('401 from the API', () => {
  test('renews the token once and repeats the request', async () => {
    const tokens = provider(['fake-access-old', 'fake-access-new']);
    setAccessTokenProvider(tokens);
    const fetchMock = stubFetch([401, 200], [{ id: 1, name: 'Focus Room', capacity: 4 }]);

    assert.deepEqual(await liveApi.getRooms(), [{ id: 1, name: 'Focus Room', capacity: 4 }]);
    assert.deepEqual(tokens.calls, [undefined, { forceRefresh: true }]);
    assert.equal(fetchMock.mock.callCount(), 2);
    assert.equal(headersOf(fetchMock, 1).Authorization, 'Bearer fake-access-new');
  });

  test('a second 401 is reported, not retried forever', async () => {
    setAccessTokenProvider(provider(['fake-access-old', 'fake-access-new']));
    const fetchMock = stubFetch([401, 401]);
    await assert.rejects(liveApi.getRooms(), (error: unknown) => {
      assert.ok(error instanceof ApiError && error.status === 401);
      assert.match(describeError(error), /kræver login/);
      return true;
    });
    assert.equal(fetchMock.mock.callCount(), 2);
  });

  test('a 401 without a token is not retried', async () => {
    setAccessTokenProvider(provider([null]));
    const fetchMock = stubFetch([401]);
    await assert.rejects(liveApi.getRooms(), ApiError);
    assert.equal(fetchMock.mock.callCount(), 1);
  });
});

describe('token renewal failures', () => {
  test('an expired session becomes an ApiError the screens already handle, with a Danish message', async () => {
    setAccessTokenProvider({ getAccessToken: async () => Promise.reject(new AuthFlowError('session-expired', 'x')) });
    const fetchMock = stubFetch([200]);
    await assert.rejects(liveApi.getRooms(), (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.kind, 'auth');
      assert.equal(describeError(error), 'Din Microsoft-session er udløbet. Log ind igen.');
      return true;
    });
    assert.equal(fetchMock.mock.callCount(), 0, 'no request without the token the user expects to send');
  });

  test('403 says the account has no access', () => {
    assert.match(describeError(new ApiError('http', 'x', 403)), /ikke adgang/);
  });
});

describe('canSendBearerToken', () => {
  test('HTTPS anywhere, HTTP only to this machine, the emulator or a private network', () => {
    for (const url of [
      'https://api.example.com/api/rooms',
      'http://localhost:5003/x',
      'http://127.0.0.1:5003/x',
      'http://10.0.2.2:5003/x',
      'http://192.168.1.20:5003/x',
      'http://172.16.0.5:5003/x',
      'http://172.31.255.1/x',
      'http://[::1]:5003/x',
      'http://my-pc.local:5003/x',
    ]) {
      assert.equal(canSendBearerToken(url), true, url);
    }
    for (const url of [
      'http://api.example.com/x',
      'http://172.32.0.1/x',
      'http://8.8.8.8/x',
      'http://192.168.1.300/x',
      'http://10.0.0.1.evil.com/x',
      'ftp://localhost/x',
      'not a url',
    ]) {
      assert.equal(canSendBearerToken(url), false, url);
    }
  });
});

describe('GET /api/me', () => {
  test('sends the token to /api/me and returns the API\'s view of the user', async () => {
    setAccessTokenProvider(provider(['fake-access-1']));
    const me = { displayName: 'Søren', username: 'soren@contoso.example', tenantId: 't', user: null };
    const fetchMock = stubFetch([200], me);
    assert.deepEqual(await fetchCurrentUser(), me);
    assert.equal(fetchMock.mock.calls[0].arguments[0], `${TEST_HTTPS_API_URL}/api/me`);
    assert.equal(headersOf(fetchMock).Authorization, 'Bearer fake-access-1');
  });

  test('failures are sorted into what the account panel shows', () => {
    const classify = (error: unknown) => classifyCurrentUserError(error, describeError).status;
    assert.equal(classify(new ApiError('http', 'x', 404)), 'unsupported');
    assert.equal(classify(new ApiError('http', 'x', 503, { code: 'authentication_not_configured' })), 'not-configured');
    assert.equal(classify(new ApiError('http', 'x', 401)), 'rejected');
    assert.equal(classify(new ApiError('http', 'x', 403, { code: 'user_disabled', detail: 'Disabled.' })), 'rejected');
    assert.equal(classify(new ApiError('network', 'x')), 'error');
    assert.equal(classify(new ApiError('http', 'x', 503)), 'error');
  });
});

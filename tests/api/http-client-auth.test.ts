import { TEST_HTTPS_API_URL } from '../support/live-https-mode';

import assert from 'node:assert/strict';
import { afterEach, describe, mock, test } from 'node:test';

import { classifyCurrentUserError, fetchCurrentUser } from '../../src/api/current-user';
import { describeError } from '../../src/api/error-messages';
import {
  ApiError,
  canSendBearerToken,
  setAccessTokenProvider,
  type AccessGrant,
  type AccessTokenProvider,
} from '../../src/api/http-client';
import { liveApi } from '../../src/api/live-api';
import { AuthController, type AuthControllerDeps } from '../../src/auth/auth-controller';
import { AuthFlowError } from '../../src/auth/auth-errors';
import { readIdTokenUser } from '../../src/auth/id-token';
import { NOW_MS, TEST_CLIENT_ID, makeIdToken } from '../support/entra-fixtures';
import { MemoryStore, until } from '../support/memory-store';

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

/** A grant whose session is still current, as the AuthController hands out. */
function grant(accessToken: string, isCurrent = () => true): AccessGrant {
  return { accessToken, isCurrent };
}

function provider(tokens: (string | null)[]): AccessTokenProvider & { calls: ({ forceRefresh?: boolean } | undefined)[] } {
  const calls: ({ forceRefresh?: boolean } | undefined)[] = [];
  return {
    calls,
    async getAccessGrant(options?: { forceRefresh?: boolean }) {
      calls.push(options);
      const token = tokens[Math.min(calls.length - 1, tokens.length - 1)];
      return token === null ? null : grant(token);
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
    setAccessTokenProvider({ getAccessGrant: async () => Promise.reject(new AuthFlowError('session-expired', 'x')) });
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
  const production = { development: false };
  const development = { development: true };

  test('a release bundle sends tokens over HTTPS only', () => {
    assert.equal(canSendBearerToken('https://api.example.com/api/rooms', production), true);
    assert.equal(canSendBearerToken('https://192.168.1.20:7219/api/rooms', production), true);
    for (const url of ['http://localhost:5003/x', 'http://127.0.0.1:5003/x', 'http://10.0.2.2:5003/x', 'http://[::1]:5003/x']) {
      assert.equal(canSendBearerToken(url, production), false, url);
    }
  });

  test('a development bundle also allows HTTP that stays on the device or the PC', () => {
    for (const url of [
      'https://api.example.com/x',
      'http://localhost:5003/x', // physical phone with adb reverse, iOS Simulator
      'http://127.0.0.1:5003/x',
      'http://127.10.0.1:5003/x',
      'http://[::1]:5003/x',
      'http://10.0.2.2:5003/x', // Android emulator → host PC
    ]) {
      assert.equal(canSendBearerToken(url, development), true, url);
    }
  });

  test('never plain HTTP across a network, not even a private Wi-Fi address', () => {
    for (const options of [production, development]) {
      for (const url of [
        'http://192.168.1.20:5003/x',
        'http://10.0.0.5:5003/x',
        'http://172.16.0.5:5003/x',
        'http://my-pc.local:5003/x',
        'http://api.example.com/x',
        'http://8.8.8.8/x',
        'http://localhost.evil.com/x',
        'http://127.0.0.1.evil.com/x',
        'http://10.0.2.2.evil.com/x',
        'ftp://localhost/x',
        'not a url',
      ]) {
        assert.equal(canSendBearerToken(url, options), false, `${url} (${options.development ? 'dev' : 'release'})`);
      }
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

describe('a request never changes identity while it waits for its token', () => {
  const HOUR = 60 * 60 * 1000;
  const USER_A = { oid: 'aaaaaaaa-0000-4000-8000-00000000000a', name: 'Anna' };
  const USER_B = { oid: 'bbbbbbbb-0000-4000-8000-00000000000b', name: 'Bo' };
  const booking = {
    roomId: 1,
    title: 'Planning',
    bookedBy: 'Anna',
    startUtc: '2031-03-12T08:00:00.000Z',
    endUtc: '2031-03-12T09:00:00.000Z',
  };

  /** Each login is the next user in `users`; tokens are named after the user. */
  function controllerFor(
    users: { oid: string; name: string }[],
    store: MemoryStore,
    clock: { now: number },
    refresh?: AuthControllerDeps['refresh'],
  ) {
    let login = 0;
    let refreshed = 0;
    return AuthController.create({
      store,
      authorize: async () => ({ type: 'success', code: 'code-from-entra', codeVerifier: 'verifier-1' }),
      redeemCode: async () => {
        const user = users[login++];
        return {
          accessToken: `fake-access-${user.name}`,
          accessTokenExpiresAt: clock.now + HOUR,
          refreshToken: `fake-refresh-${user.name}`,
          idToken: makeIdToken({ oid: user.oid, name: user.name }),
        };
      },
      refresh:
        refresh ??
        (async (refreshToken) => ({
          accessToken: `${refreshToken.replace('refresh', 'access')}-renewed-${++refreshed}`,
          accessTokenExpiresAt: clock.now + HOUR,
          refreshToken: `${refreshToken}-${refreshed}`,
        })),
      readUser: (idToken) => readIdTokenUser(idToken, { clientId: TEST_CLIENT_ID, requiredTenantId: null, nowMs: clock.now }),
      now: () => clock.now,
    });
  }

  async function signedInAsAnna(refresh?: AuthControllerDeps['refresh']) {
    const clock = { now: NOW_MS };
    const store = new MemoryStore();
    const controller = controllerFor([USER_A, USER_B], store, clock, refresh);
    await controller.start();
    await controller.signIn();
    setAccessTokenProvider(controller);
    return { clock, store, controller };
  }

  async function rejectsAsSessionChanged(promise: Promise<unknown>) {
    await assert.rejects(promise, (error: unknown) => {
      assert.ok(error instanceof ApiError, String(error));
      assert.equal(error.kind, 'auth');
      assert.ok(error.cause instanceof AuthFlowError && error.cause.kind === 'session-changed');
      assert.match(describeError(error), /ikke udført, fordi du loggede ud eller skiftede konto/);
      return true;
    });
  }

  test('logout while a booking waits for its token: the booking is not sent, not even anonymously', async () => {
    const { clock, store, controller } = await signedInAsAnna();
    const fetchMock = stubFetch([201], { id: 1 });

    clock.now += HOUR;
    const write = store.hold('set');
    const pending = liveApi.createBooking(booking);
    await until(() => store.waiting.set > 0, 'the renewal is saving the rotated refresh token');
    const signingOut = controller.signOut();
    write.release();

    await rejectsAsSessionChanged(pending);
    await signingOut;
    assert.equal(fetchMock.mock.callCount(), 0, 'no POST /api/bookings left the app');
  });

  test('an ordinary anonymous booking after the logout still works, without a token', async () => {
    const { clock, store, controller } = await signedInAsAnna();
    const fetchMock = stubFetch([201], { id: 1 });
    clock.now += HOUR;
    const write = store.hold('set');
    const pending = liveApi.createBooking(booking);
    await until(() => store.waiting.set > 0, 'the renewal is saving');
    const signingOut = controller.signOut();
    write.release();
    await rejectsAsSessionChanged(pending);
    await signingOut;

    // Started while signed out: anonymous, exactly as without login.
    await liveApi.createBooking(booking);

    assert.equal(fetchMock.mock.callCount(), 1);
    assert.equal(headersOf(fetchMock).Authorization, undefined);
  });

  test('logout and login as another user while a booking waits: sent neither as Anna nor as Bo', async () => {
    const { clock, store, controller } = await signedInAsAnna();
    const fetchMock = stubFetch([201], { id: 1 });

    clock.now += HOUR;
    const write = store.hold('set');
    const pending = liveApi.createBooking(booking);
    await until(() => store.waiting.set > 0, "Anna's renewal is saving");
    const signingOut = controller.signOut();
    const signingIn = controller.signIn();
    await until(() => controller.getState().status === 'signed-in', 'Bo has signed in');
    const state = controller.getState();
    assert.equal(state.status === 'signed-in' && state.user.name, 'Bo');
    write.release();

    await rejectsAsSessionChanged(pending);
    await Promise.all([signingOut, signingIn]);
    assert.equal(fetchMock.mock.callCount(), 0);

    // Bo's own booking carries Bo's token.
    await liveApi.createBooking({ ...booking, bookedBy: 'Bo' });
    assert.equal(headersOf(fetchMock).Authorization, 'Bearer fake-access-Bo');
  });

  test('a renewal that fails after logout aborts the request instead of sending it anonymously', async () => {
    let rejectRefresh: ((error: unknown) => void) | undefined;
    const { clock, controller } = await signedInAsAnna(
      () => new Promise((_resolve, reject) => (rejectRefresh = reject)),
    );
    const fetchMock = stubFetch([201], { id: 1 });

    clock.now += HOUR;
    const pending = liveApi.createBooking(booking);
    await until(() => rejectRefresh !== undefined, 'the renewal is waiting for Entra');
    await controller.signOut();
    rejectRefresh?.(new AuthFlowError('network', 'offline'));

    await rejectsAsSessionChanged(pending);
    assert.equal(fetchMock.mock.callCount(), 0);
  });

  test('a grant whose session ended just before sending is not sent', async () => {
    let current = true;
    setAccessTokenProvider({ getAccessGrant: async () => grant('fake-access-Anna', () => current) });
    const fetchMock = stubFetch([201], { id: 1 });
    current = false;

    await rejectsAsSessionChanged(liveApi.createBooking(booking));
    assert.equal(fetchMock.mock.callCount(), 0);
  });

  test('a 401 whose forced renewal overlaps a logout is not sent again, by anyone', async () => {
    const { store, controller } = await signedInAsAnna();
    const fetchMock = stubFetch([401, 201], { id: 1 });

    const write = store.hold('set');
    const pending = liveApi.createBooking(booking);
    await until(() => store.waiting.set > 0, 'the forced renewal after the 401 is saving');
    const signingOut = controller.signOut();
    write.release();

    await rejectsAsSessionChanged(pending);
    await signingOut;
    assert.equal(fetchMock.mock.callCount(), 1, "only the first, rejected attempt with Anna's token");
    assert.equal(headersOf(fetchMock).Authorization, 'Bearer fake-access-Anna');
  });
  /**
   * fetch stand-in whose first call waits until the test answers it, so the
   * test can change the session while Anna's first attempt is on its way.
   * Later calls answer 201 at once (and must not happen in the abort cases).
   */
  function fetchWithHeldFirstAnswer() {
    let answerFirst: ((response: Response) => void) | undefined;
    let calls = 0;
    const fetchMock = mock.method(globalThis, 'fetch', async () => {
      if (++calls === 1) return new Promise<Response>((resolve) => (answerFirst = resolve));
      return new Response(JSON.stringify({ id: 1 }), { status: 201, headers: { 'Content-Type': 'application/json' } });
    });
    return {
      fetchMock,
      sent: () => answerFirst !== undefined,
      answer401: () => answerFirst?.(new Response(null, { status: 401 })),
    };
  }

  function trackedRefresh(calls: string[]): AuthControllerDeps['refresh'] {
    return async (refreshToken) => {
      calls.push(refreshToken);
      return {
        accessToken: `${refreshToken.replace('refresh', 'access')}-renewed`,
        accessTokenExpiresAt: NOW_MS + 2 * HOUR,
        refreshToken: `${refreshToken}-rotated`,
      };
    };
  }

  test('401, then logout and login as Bo before the retry: aborted, no second request, Bo is not renewed', async () => {
    const refreshCalls: string[] = [];
    const { controller } = await signedInAsAnna(trackedRefresh(refreshCalls));
    const { fetchMock, sent, answer401 } = fetchWithHeldFirstAnswer();

    const pending = liveApi.createBooking(booking);
    await until(sent, "Anna's first attempt is on its way");
    await controller.signOut();
    await controller.signIn();
    const state = controller.getState();
    assert.equal(state.status === 'signed-in' && state.user.name, 'Bo');
    answer401();

    await rejectsAsSessionChanged(pending);
    assert.equal(fetchMock.mock.callCount(), 1, 'the retry must not be sent');
    assert.equal(headersOf(fetchMock).Authorization, 'Bearer fake-access-Anna');
    assert.deepEqual(refreshCalls, [], "Bo's session must not be renewed for Anna's request");
  });

  test('401, then logout only before the retry: aborted with session-changed, no second request', async () => {
    const refreshCalls: string[] = [];
    const { controller } = await signedInAsAnna(trackedRefresh(refreshCalls));
    const { fetchMock, sent, answer401 } = fetchWithHeldFirstAnswer();

    const pending = liveApi.createBooking(booking);
    await until(sent, "Anna's first attempt is on its way");
    await controller.signOut();
    answer401();

    await rejectsAsSessionChanged(pending);
    assert.equal(fetchMock.mock.callCount(), 1);
    assert.deepEqual(refreshCalls, []);
  });

  test('logout and login as Bo during the forced renewal after a 401: aborted, no second request', async () => {
    const { store, controller } = await signedInAsAnna();
    const fetchMock = stubFetch([401, 201], { id: 1 });

    const write = store.hold('set');
    const pending = liveApi.createBooking(booking);
    await until(() => store.waiting.set > 0, "the forced renewal of Anna's token is saving");
    const signingOut = controller.signOut();
    const signingIn = controller.signIn();
    await until(() => controller.getState().status === 'signed-in', 'Bo has signed in');
    write.release();

    await rejectsAsSessionChanged(pending);
    await Promise.all([signingOut, signingIn]);
    assert.equal(fetchMock.mock.callCount(), 1);
    assert.equal(headersOf(fetchMock).Authorization, 'Bearer fake-access-Anna');
  });

  test('same session: a 401 renews Anna\'s token once and the retry carries the renewed token', async () => {
    const refreshCalls: string[] = [];
    await signedInAsAnna(trackedRefresh(refreshCalls));
    const fetchMock = stubFetch([401, 201], { id: 7 });

    assert.deepEqual(await liveApi.createBooking(booking), { id: 7 });

    assert.deepEqual(refreshCalls, ['fake-refresh-Anna']);
    assert.equal(fetchMock.mock.callCount(), 2);
    assert.equal(headersOf(fetchMock, 0).Authorization, 'Bearer fake-access-Anna');
    assert.equal(headersOf(fetchMock, 1).Authorization, 'Bearer fake-access-Anna-renewed');
  });
});

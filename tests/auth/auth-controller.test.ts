import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, mock, test } from 'node:test';

import {
  ACCESS_TOKEN_RENEWAL_MARGIN_MS,
  AuthController,
  type AuthControllerDeps,
  type AuthorizeResult,
  type AuthState,
} from '../../src/auth/auth-controller';
import { AuthFlowError, oauthError } from '../../src/auth/auth-errors';
import { readIdTokenUser } from '../../src/auth/id-token';
import { SESSION_META_KEY, loadSession, saveSession } from '../../src/auth/session-storage';
import type { TokenSet } from '../../src/auth/token-client';
import { NOW_MS, TEST_CLIENT_ID, TEST_OBJECT_ID, TEST_TENANT_ID, makeIdToken } from '../support/entra-fixtures';
import { MemoryStore } from '../support/memory-store';

const HOUR = 60 * 60 * 1000;
const storedUser = { name: 'Søren Ærø-Ågård', username: 'soren@contoso.example', tenantId: TEST_TENANT_ID, objectId: TEST_OBJECT_ID };

/** A manually resolved promise, to control the order of async steps. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function tokens(n: number, overrides: Partial<TokenSet> = {}): TokenSet {
  return {
    accessToken: `fake-access-${n}`,
    accessTokenExpiresAt: clock.now + HOUR,
    refreshToken: `fake-refresh-${n}`,
    idToken: makeIdToken(),
    ...overrides,
  };
}

const clock = { now: NOW_MS };

interface Fake {
  controller: AuthController;
  store: MemoryStore;
  states: AuthState[];
  authorize: ReturnType<typeof mock.fn<AuthControllerDeps['authorize']>>;
  redeemCode: ReturnType<typeof mock.fn<AuthControllerDeps['redeemCode']>>;
  refresh: ReturnType<typeof mock.fn<AuthControllerDeps['refresh']>>;
}

function setup(options: Partial<Pick<AuthControllerDeps, 'authorize' | 'redeemCode' | 'refresh'>> & { store?: MemoryStore } = {}): Fake {
  const store = options.store ?? new MemoryStore();
  // Code exchanges hand out fake-access-1, -2 …; refreshes fake-access-101, -102 …
  let issued = 0;
  let refreshed = 100;
  const authorize = mock.fn<AuthControllerDeps['authorize']>(
    options.authorize ?? (async (): Promise<AuthorizeResult> => ({ type: 'success', code: 'code-from-entra', codeVerifier: 'verifier-1' })),
  );
  const redeemCode = mock.fn<AuthControllerDeps['redeemCode']>(options.redeemCode ?? (async () => tokens(++issued)));
  const refresh = mock.fn<AuthControllerDeps['refresh']>(options.refresh ?? (async () => tokens(++refreshed)));
  const controller = AuthController.create({
    store,
    authorize,
    redeemCode,
    refresh,
    readUser: (idToken) => readIdTokenUser(idToken, { clientId: TEST_CLIENT_ID, requiredTenantId: null, nowMs: clock.now }),
    now: () => clock.now,
  });
  const states: AuthState[] = [];
  controller.subscribe((state) => states.push(state));
  return { controller, store, states, authorize, redeemCode, refresh };
}

async function signedIn(fake: Fake = setup()): Promise<Fake> {
  await fake.controller.start();
  await fake.controller.signIn();
  assert.equal(fake.controller.getState().status, 'signed-in');
  return fake;
}

// No token may ever be written to the console.
let consoleCalls: unknown[][] = [];
beforeEach(() => {
  clock.now = NOW_MS;
  consoleCalls = [];
  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    mock.method(console, method, (...args: unknown[]) => consoleCalls.push(args));
  }
});
afterEach(() => {
  const logged = JSON.stringify(consoleCalls);
  mock.restoreAll();
  assert.doesNotMatch(logged, /fake-access|fake-refresh|code-from-entra|verifier-/, 'a token was logged');
});

describe('unavailable', () => {
  test('does nothing and hands out no token', async () => {
    const controller = AuthController.unavailable('not-configured');
    await controller.start();
    await controller.signIn();
    assert.deepEqual(controller.getState(), { status: 'unavailable', reason: 'not-configured', detail: undefined });
    assert.equal(await controller.getAccessToken(), null);
  });
});

describe('start', () => {
  test('nothing stored → signed out, and no token', async () => {
    const { controller } = setup();
    assert.equal(controller.getState().status, 'restoring');
    await controller.start();
    assert.deepEqual(controller.getState(), { status: 'signed-out' });
    assert.equal(await controller.getAccessToken(), null);
  });

  test('a stored session → signed in, checked with Microsoft at once, rotated token saved', async () => {
    const store = new MemoryStore();
    await saveSession(store, { refreshToken: 'fake-refresh-old', user: storedUser });
    const fake = setup({ store });

    await fake.controller.start();

    assert.equal(fake.refresh.mock.callCount(), 1);
    assert.equal(fake.refresh.mock.calls[0].arguments[0], 'fake-refresh-old');
    assert.equal(fake.controller.getState().status, 'signed-in');
    assert.equal((await loadSession(store))?.refreshToken, 'fake-refresh-101');
    // The access token from the check is reused.
    assert.equal(await fake.controller.getAccessToken(), 'fake-access-101');
    assert.equal(fake.refresh.mock.callCount(), 1);
  });

  test('a stored session that Microsoft no longer accepts → signed out and deleted', async () => {
    const store = new MemoryStore();
    await saveSession(store, { refreshToken: 'fake-refresh-old', user: storedUser });
    const fake = setup({ store, refresh: async () => Promise.reject(oauthError('invalid_grant', 'AADSTS700082: expired')) });

    await fake.controller.start();

    const state = fake.controller.getState();
    assert.equal(state.status, 'signed-out');
    assert.match(state.status === 'signed-out' ? (state.notice?.message ?? '') : '', /udløbet/);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(store.values.size, 0);
  });

  test('offline at start → stays signed in with a warning, the session is kept', async () => {
    const store = new MemoryStore();
    await saveSession(store, { refreshToken: 'fake-refresh-old', user: storedUser });
    const fake = setup({ store, refresh: async () => Promise.reject(new AuthFlowError('network', 'offline')) });

    await fake.controller.start();

    const state = fake.controller.getState();
    assert.equal(state.status, 'signed-in');
    assert.match(state.status === 'signed-in' ? (state.warning ?? '') : '', /forbindelse til Microsoft/);
    assert.equal((await loadSession(store))?.refreshToken, 'fake-refresh-old');
  });

  test('an unreadable keystore → signed out with an explanation', async () => {
    const store = new MemoryStore();
    store.failReads = true;
    const { controller } = setup({ store });
    await controller.start();
    const state = controller.getState();
    assert.equal(state.status, 'signed-out');
    assert.equal(state.status === 'signed-out' && state.notice?.kind, 'error');
  });

  test('start twice restores once', async () => {
    const store = new MemoryStore();
    await saveSession(store, { refreshToken: 'fake-refresh-old', user: storedUser });
    const fake = setup({ store });
    await Promise.all([fake.controller.start(), fake.controller.start()]);
    assert.equal(fake.refresh.mock.callCount(), 1);
  });
});

describe('signIn', () => {
  test('signing-in → signed-in with the user from the ID token; only the refresh token is stored', async () => {
    const fake = setup();
    await fake.controller.start();
    await fake.controller.signIn();

    assert.deepEqual(
      fake.states.map((state) => state.status),
      ['signed-out', 'signing-in', 'signed-in'],
    );
    assert.deepEqual(fake.controller.getState(), { status: 'signed-in', user: storedUser });
    assert.deepEqual(fake.redeemCode.mock.calls[0].arguments, ['code-from-entra', 'verifier-1']);
    assert.equal(await fake.controller.getAccessToken(), 'fake-access-1');

    assert.deepEqual(await loadSession(fake.store), { refreshToken: 'fake-refresh-1', user: storedUser });
    assert.doesNotMatch(fake.store.dump(), /fake-access/);
  });

  test('the state never contains a token', async () => {
    const fake = await signedIn();
    assert.doesNotMatch(JSON.stringify(fake.states), /fake-access|fake-refresh|eyJ/);
  });

  test('closing the browser → signed out with a calm notice, nothing exchanged', async () => {
    const fake = setup({ authorize: async () => ({ type: 'cancel' }) });
    await fake.controller.start();
    await fake.controller.signIn();
    assert.deepEqual(fake.controller.getState(), {
      status: 'signed-out',
      notice: { kind: 'info', message: 'Login blev annulleret.' },
    });
    assert.equal(fake.redeemCode.mock.callCount(), 0);
  });

  test('an error on the redirect (e.g. consent missing) → signed out with the reason', async () => {
    const fake = setup({ authorize: async () => Promise.reject(oauthError('invalid_request', 'AADSTS65001: consent')) });
    await fake.controller.start();
    await fake.controller.signIn();
    const state = fake.controller.getState();
    assert.equal(state.status, 'signed-out');
    assert.equal(state.status === 'signed-out' && state.notice?.kind, 'error');
    assert.match(state.status === 'signed-out' ? (state.notice?.message ?? '') : '', /tilladelse.*AADSTS65001/);
  });

  test('a state mismatch on the redirect is refused', async () => {
    const fake = setup({ authorize: async () => Promise.reject(oauthError('state_mismatch')) });
    await fake.controller.start();
    await fake.controller.signIn();
    const state = fake.controller.getState();
    assert.match(state.status === 'signed-out' ? (state.notice?.message ?? '') : '', /hørte ikke til dette login/);
    assert.equal(fake.redeemCode.mock.callCount(), 0);
  });

  test('a code exchange failure or an ID token for another app → signed out, nothing stored', async () => {
    for (const redeemCode of [
      async () => Promise.reject(new AuthFlowError('network', 'offline')),
      async () => tokens(1, { idToken: makeIdToken({ aud: 'someone-else' }) }),
    ]) {
      const fake = setup({ redeemCode });
      await fake.controller.start();
      await fake.controller.signIn();
      assert.equal(fake.controller.getState().status, 'signed-out');
      assert.equal(await fake.controller.getAccessToken(), null);
      assert.equal(fake.store.values.size, 0);
    }
  });

  test('a second tap while signing in does not open a second login', async () => {
    const pending = deferred<AuthorizeResult>();
    const fake = setup({ authorize: () => pending.promise });
    await fake.controller.start();
    const first = fake.controller.signIn();
    await fake.controller.signIn();
    assert.equal(fake.authorize.mock.callCount(), 1);
    pending.resolve({ type: 'cancel' });
    await first;
  });

  test('no refresh token (offline_access refused) → signed in for now, with a warning', async () => {
    const fake = await signedIn(setup({ redeemCode: async () => tokens(1, { refreshToken: undefined }) }));
    const state = fake.controller.getState();
    assert.match(state.status === 'signed-in' ? (state.warning ?? '') : '', /refresh token/);
    assert.equal(fake.store.values.size, 0);
  });

  test('a keystore that cannot write → signed in for now, with a warning', async () => {
    const store = new MemoryStore();
    const fake = setup({ store });
    await fake.controller.start();
    store.failWrites = true;
    await fake.controller.signIn();
    const state = fake.controller.getState();
    assert.equal(state.status, 'signed-in');
    assert.match(state.status === 'signed-in' ? (state.warning ?? '') : '', /kunne ikke gemmes/);
  });
});

describe('getAccessToken', () => {
  test('reuses the token until shortly before it expires, then refreshes and rotates', async () => {
    const fake = await signedIn();

    clock.now += HOUR - ACCESS_TOKEN_RENEWAL_MARGIN_MS - 1;
    assert.equal(await fake.controller.getAccessToken(), 'fake-access-1');
    assert.equal(fake.refresh.mock.callCount(), 0);

    clock.now += 2;
    assert.equal(await fake.controller.getAccessToken(), 'fake-access-101');
    assert.equal(fake.refresh.mock.calls[0].arguments[0], 'fake-refresh-1');
    assert.equal((await loadSession(fake.store))?.refreshToken, 'fake-refresh-101');
  });

  test('forceRefresh renews even a fresh token (after a 401)', async () => {
    const fake = await signedIn();
    assert.equal(await fake.controller.getAccessToken({ forceRefresh: true }), 'fake-access-101');
  });

  test('concurrent callers share one refresh', async () => {
    const pending = deferred<TokenSet>();
    const fake = await signedIn(setup({ refresh: () => pending.promise }));
    clock.now += HOUR;

    const calls = [fake.controller.getAccessToken(), fake.controller.getAccessToken(), fake.controller.getAccessToken()];
    pending.resolve(tokens(7));
    assert.deepEqual(await Promise.all(calls), ['fake-access-7', 'fake-access-7', 'fake-access-7']);
    assert.equal(fake.refresh.mock.callCount(), 1);
  });

  test('a refresh response without a new refresh token keeps the old one', async () => {
    const fake = await signedIn(setup({ refresh: async () => tokens(5, { refreshToken: undefined, idToken: undefined }) }));
    clock.now += HOUR;
    assert.equal(await fake.controller.getAccessToken(), 'fake-access-5');
    clock.now += HOUR;
    await fake.controller.getAccessToken();
    assert.equal(fake.refresh.mock.calls[1].arguments[0], 'fake-refresh-1');
  });

  test('an expired session → throws session-expired, signs out and deletes the stored session', async () => {
    const fake = await signedIn(setup({ refresh: async () => Promise.reject(oauthError('invalid_grant', 'AADSTS50173: revoked')) }));
    clock.now += HOUR;

    await assert.rejects(fake.controller.getAccessToken(), (error: unknown) => error instanceof AuthFlowError && error.kind === 'session-expired');
    assert.equal(fake.controller.getState().status, 'signed-out');
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(fake.store.values.size, 0);
    // Signed out now: later requests go without a token instead of failing.
    assert.equal(await fake.controller.getAccessToken(), null);
  });

  test('offline → throws network, the user stays signed in and the next call tries again', async () => {
    let online = false;
    const fake = await signedIn(
      setup({ refresh: async () => (online ? tokens(9) : Promise.reject(new AuthFlowError('network', 'offline'))) }),
    );
    clock.now += HOUR;

    await assert.rejects(fake.controller.getAccessToken(), (error: unknown) => error instanceof AuthFlowError && error.kind === 'network');
    assert.equal(fake.controller.getState().status, 'signed-in');
    assert.ok(await loadSession(fake.store));

    online = true;
    assert.equal(await fake.controller.getAccessToken(), 'fake-access-9');
    const state = fake.controller.getState();
    assert.equal(state.status === 'signed-in' && state.warning, undefined);
  });
});

describe('signOut', () => {
  test('forgets the tokens and deletes the stored session', async () => {
    const fake = await signedIn();
    assert.ok(fake.store.values.has(SESSION_META_KEY));

    await fake.controller.signOut();

    assert.deepEqual(fake.controller.getState(), { status: 'signed-out', notice: { kind: 'info', message: 'Du er logget ud.' } });
    assert.equal(await fake.controller.getAccessToken(), null);
    assert.equal(fake.store.values.size, 0);
  });

  test('a refresh that finishes after sign-out does not bring the session back', async () => {
    const pending = deferred<TokenSet>();
    const fake = await signedIn(setup({ refresh: () => pending.promise }));
    clock.now += HOUR;

    const inFlight = fake.controller.getAccessToken();
    await fake.controller.signOut();
    pending.resolve(tokens(42));

    assert.equal(await inFlight, null);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(fake.controller.getState().status, 'signed-out');
    assert.equal(fake.store.values.size, 0);
    assert.equal(await fake.controller.getAccessToken(), null);
  });

  test('a login that returns after sign-out is ignored', async () => {
    const pending = deferred<AuthorizeResult>();
    const fake = setup({ authorize: () => pending.promise });
    await fake.controller.start();
    const signingIn = fake.controller.signIn();
    await fake.controller.signOut();
    pending.resolve({ type: 'success', code: 'code-from-entra', codeVerifier: 'verifier-1' });
    await signingIn;
    assert.equal(fake.controller.getState().status, 'signed-out');
    assert.equal(fake.redeemCode.mock.callCount(), 0);
    assert.equal(fake.store.values.size, 0);
  });

  test('a keystore that cannot delete → still signed out in the app, with a warning', async () => {
    const fake = await signedIn();
    fake.store.failDeletes = true;
    await fake.controller.signOut();
    const state = fake.controller.getState();
    assert.equal(state.status, 'signed-out');
    assert.equal(state.status === 'signed-out' && state.notice?.kind, 'error');
    assert.equal(await fake.controller.getAccessToken(), null);
  });

  test('another account can sign in afterwards', async () => {
    const fake = await signedIn();
    await fake.controller.signOut();
    await fake.controller.signIn();
    assert.equal(fake.controller.getState().status, 'signed-in');
    assert.equal(await fake.controller.getAccessToken(), 'fake-access-2');
  });
});

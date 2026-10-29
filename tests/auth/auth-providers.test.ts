import assert from 'node:assert/strict';
import { describe, mock, test } from 'node:test';

import { AuthController, type AuthProviderClient, type AuthState } from '../../src/auth/auth-controller';
import { readExternalIdTokenUser, readIdTokenUser, type AuthUser } from '../../src/auth/id-token';
import { SESSION_META_KEY, loadSession, refreshChunkKey, saveSession } from '../../src/auth/session-storage';
import type { TokenSet } from '../../src/auth/token-client';
import { NOW_MS, TEST_CLIENT_ID, TEST_OBJECT_ID, TEST_TENANT_ID, makeIdToken } from '../support/entra-fixtures';
import {
  EXTERNAL_CLIENT_ID,
  EXTERNAL_ISSUER,
  EXTERNAL_OBJECT_ID,
  EXTERNAL_TENANT_ID,
  makeExternalIdToken,
} from '../support/external-id-fixtures';
import { MemoryStore, until } from '../support/memory-store';

const HOUR = 60 * 60 * 1000;

const emailUser: AuthUser = {
  provider: 'external-id',
  name: 'Emma E-mail',
  username: 'emma@example.com',
  tenantId: EXTERNAL_TENANT_ID,
  objectId: EXTERNAL_OBJECT_ID,
};

function tokens(prefix: string, idToken?: string): TokenSet {
  return {
    accessToken: `${prefix}-access`,
    accessTokenExpiresAt: NOW_MS + HOUR,
    refreshToken: `${prefix}-refresh`,
    idToken,
  };
}

/** A provider whose every step is a mock, named so a test sees which provider ran. */
function fakeProvider(name: string, readUser: AuthProviderClient['readUser'], idToken: () => string) {
  return {
    authorize: mock.fn<AuthProviderClient['authorize']>(async () => ({ type: 'success', code: `${name}-code`, codeVerifier: 'v' })),
    redeemCode: mock.fn<AuthProviderClient['redeemCode']>(async () => tokens(name, idToken())),
    refresh: mock.fn<AuthProviderClient['refresh']>(async () => tokens(`${name}-renewed`, idToken())),
    readUser,
  };
}

function setup(options: { withEmail?: boolean; store?: MemoryStore; externalIdToken?: () => string } = {}) {
  const store = options.store ?? new MemoryStore();
  const entra = fakeProvider(
    'entra',
    (idToken) => readIdTokenUser(idToken, { clientId: TEST_CLIENT_ID, requiredTenantId: null, nowMs: NOW_MS }),
    () => makeIdToken(),
  );
  const externalId = fakeProvider(
    'email',
    (idToken) =>
      readExternalIdTokenUser(idToken, { clientId: EXTERNAL_CLIENT_ID, tenantId: EXTERNAL_TENANT_ID, issuer: EXTERNAL_ISSUER, nowMs: NOW_MS }),
    options.externalIdToken ?? (() => makeExternalIdToken()),
  );
  const controller = AuthController.create({
    store,
    providers: { entra, ...(options.withEmail === false ? {} : { 'external-id': externalId }) },
    now: () => NOW_MS,
  });
  const states: AuthState[] = [];
  controller.subscribe((state) => states.push(state));
  return { controller, store, states, entra, externalId };
}

describe('choosing how to sign in', () => {
  test('Microsoft is always offered first; the e-mail code only when configured', () => {
    assert.deepEqual(setup().controller.getProviders(), ['entra', 'external-id']);
    assert.deepEqual(setup({ withEmail: false }).controller.getProviders(), ['entra']);
    assert.deepEqual(AuthController.unavailable('web').getProviders(), []);
  });

  test('an e-mail sign-in runs only the External ID login and keeps its provider', async () => {
    const { controller, store, entra, externalId } = setup();
    await controller.start();

    await controller.signIn('external-id');

    assert.equal(externalId.authorize.mock.callCount(), 1);
    assert.equal(entra.authorize.mock.callCount(), 0);
    assert.deepEqual(controller.getState(), { status: 'signed-in', user: emailUser });
    assert.equal(await controller.getAccessToken(), 'email-access');
    assert.deepEqual(await loadSession(store), { refreshToken: 'email-refresh', user: emailUser });
  });

  test('signIn without a provider is the Microsoft sign-in, as before', async () => {
    const { controller, entra, externalId } = setup();
    await controller.start();

    await controller.signIn();

    assert.equal(entra.authorize.mock.callCount(), 1);
    assert.equal(externalId.authorize.mock.callCount(), 0);
    const state = controller.getState();
    assert.ok(state.status === 'signed-in' && state.user.provider === 'entra');
  });

  test('the e-mail code cannot be chosen when it is not configured', async () => {
    const { controller, entra } = setup({ withEmail: false });
    await controller.start();

    await controller.signIn('external-id');

    assert.deepEqual(controller.getState(), { status: 'signed-out' });
    assert.equal(entra.authorize.mock.callCount(), 0);
  });

  test("a Microsoft ID token from the e-mail login is refused: the user would be shown under the wrong provider", async () => {
    // A misconfigured External ID client that returns Microsoft tokens.
    const mixedUp = setup({ externalIdToken: () => makeIdToken({ aud: EXTERNAL_CLIENT_ID }) });
    await mixedUp.controller.start();

    await mixedUp.controller.signIn('external-id');

    assert.equal(mixedUp.controller.getState().status, 'signed-out');
    assert.equal(await mixedUp.controller.getAccessToken(), null);
  });
});

describe('renewing and restoring', () => {
  test('an e-mail session is renewed by External ID, never by Microsoft', async () => {
    const store = new MemoryStore();
    await saveSession(store, { refreshToken: 'stored-email-refresh', user: emailUser });
    const { controller, entra, externalId } = setup({ store });

    await controller.start();

    assert.equal(externalId.refresh.mock.callCount(), 1);
    assert.equal(externalId.refresh.mock.calls[0].arguments[0], 'stored-email-refresh');
    assert.equal(entra.refresh.mock.callCount(), 0);
    assert.deepEqual(controller.getState(), { status: 'signed-in', user: emailUser });
  });

  test('a session saved before e-mail sign-in existed is a Microsoft session and still works', async () => {
    const store = new MemoryStore();
    // Exactly what the previous version of the app stored: no provider.
    await store.setItem(refreshChunkKey(0), 'old-refresh');
    await store.setItem(
      SESSION_META_KEY,
      JSON.stringify({ version: 1, chunks: 1, user: { name: 'Søren', username: null, tenantId: TEST_TENANT_ID, objectId: TEST_OBJECT_ID } }),
    );
    const { controller, entra, externalId } = setup({ store });

    await controller.start();

    assert.equal(entra.refresh.mock.callCount(), 1);
    assert.equal(entra.refresh.mock.calls[0].arguments[0], 'old-refresh');
    assert.equal(externalId.refresh.mock.callCount(), 0);
    const state = controller.getState();
    assert.ok(state.status === 'signed-in' && state.user.provider === 'entra');
  });

  test('an e-mail session in a build without e-mail sign-in is signed out and deleted, not sent to Microsoft', async () => {
    const store = new MemoryStore();
    await saveSession(store, { refreshToken: 'stored-email-refresh', user: emailUser });
    const { controller, entra } = setup({ store, withEmail: false });

    await controller.start();

    const state = controller.getState();
    assert.ok(state.status === 'signed-out' && state.notice?.message.includes('e-mail-kode'));
    assert.equal(entra.refresh.mock.callCount(), 0);
    await until(() => !store.values.has(SESSION_META_KEY), 'the stored session to be deleted');
  });

  test('a renewal whose ID token names another user ends the session', async () => {
    const store = new MemoryStore();
    await saveSession(store, { refreshToken: 'stored-email-refresh', user: emailUser });
    const { controller } = setup({ store, externalIdToken: () => makeExternalIdToken({ oid: '99999999-90ab-4cde-8f01-234567890abc' }) });

    await controller.start();

    assert.equal(controller.getState().status, 'signed-out');
    await until(() => !store.values.has(SESSION_META_KEY), 'the stored session to be deleted');
  });

  test('a stored session with an unknown provider is not loaded', async () => {
    const store = new MemoryStore();
    await store.setItem(refreshChunkKey(0), 'r');
    await store.setItem(SESSION_META_KEY, JSON.stringify({ version: 1, chunks: 1, user: { ...emailUser, provider: 'google' } }));

    assert.equal(await loadSession(store), null);
  });
});

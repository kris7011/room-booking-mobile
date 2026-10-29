import '../support/live-https-mode';

import assert from 'node:assert/strict';
import { afterEach, describe, mock, test } from 'node:test';

import { currentUserApi, sessionWarningToShow, verifyAndRegister, type ServerIdentity } from '../../src/api/current-user';
import { describeError } from '../../src/api/error-messages';
import { setAccessTokenProvider } from '../../src/api/http-client';
import { AuthController } from '../../src/auth/auth-controller';
import { AuthFlowError } from '../../src/auth/auth-errors';
import { saveSession } from '../../src/auth/session-storage';
import type { CurrentUserResponse } from '../../src/models/current-user';
import { TEST_OBJECT_ID, TEST_TENANT_ID } from '../support/entra-fixtures';
import { MemoryStore } from '../support/memory-store';

// What the account panel shows below the identity line while signed in.
// Phase 5E (sign-in step 7): after an offline start the panel showed
// "Kunne ikke få forbindelse til Microsoft…" twice.

afterEach(() => {
  setAccessTokenProvider(null);
  mock.restoreAll();
});

const OFFLINE = 'Kunne ikke få forbindelse til Microsoft. Tjek internetforbindelsen og prøv igen.';
const VERIFIED: CurrentUserResponse = { displayName: 'Søren', username: null, tenantId: 'tenant', user: null };

describe('an offline start', () => {
  test('the token renewal and the /api/me check report one error: the panel shows it once', async () => {
    const store = new MemoryStore();
    await saveSession(store, {
      refreshToken: 'fake-refresh-old',
      user: { provider: 'entra', name: 'Søren', username: null, tenantId: TEST_TENANT_ID, objectId: TEST_OBJECT_ID },
    });
    const controller = AuthController.create({
      store,
      providers: {
        entra: {
          authorize: async () => assert.fail('no interactive login'),
          redeemCode: async () => assert.fail('no code'),
          refresh: async () => Promise.reject(new AuthFlowError('network', 'offline')),
          readUser: () => assert.fail('no ID token'),
        },
      },
    });
    setAccessTokenProvider(controller);
    const fetch = mock.method(globalThis, 'fetch', async () => assert.fail('nothing reaches the API'));

    // As at a cold start: the account panel's check starts once the restored
    // session is signed in (useServerIdentity), while the restore renews the token.
    let check: Promise<ServerIdentity> | undefined;
    controller.subscribe((state) => {
      if (state.status === 'signed-in') check ??= verifyAndRegister(currentUserApi, describeError);
    });
    await controller.start();
    assert.ok(check);
    const identity = await check;
    const state = controller.getState();

    // Both describe the same failure in the same words…
    assert.equal(state.status, 'signed-in');
    assert.equal(state.status === 'signed-in' && state.warning, OFFLINE);
    assert.deepEqual(identity, { status: 'error', message: OFFLINE });
    assert.equal(fetch.mock.callCount(), 0);
    // …so the identity line, which has "Prøv igen", shows it alone.
    assert.equal(sessionWarningToShow(state.status === 'signed-in' ? state.warning : undefined, identity), undefined);
  });
});

describe('sessionWarningToShow', () => {
  test('a warning the identity line does not show is kept', () => {
    const notSaved = 'Sessionen kunne ikke gemmes sikkert på enheden, så du skal logge ind igen, når appen genstartes.';
    const identities: (ServerIdentity | null)[] = [
      null,
      { status: 'checking' },
      { status: 'registered', identity: VERIFIED, user: { publicId: 'u', displayName: 'Søren', organizations: [] }, registeredNow: false },
      { status: 'error', message: OFFLINE },
      { status: 'rejected', message: 'Din Room Booking-konto er deaktiveret.' },
    ];
    for (const identity of identities) {
      assert.equal(sessionWarningToShow(notSaved, identity), notSaved, identity?.status ?? 'null');
    }
  });

  test('the same text in any identity line with a message is shown once', () => {
    const identities: ServerIdentity[] = [
      { status: 'error', message: OFFLINE },
      { status: 'rejected', message: OFFLINE },
      { status: 'registration-failed', identity: VERIFIED, message: OFFLINE },
    ];
    for (const identity of identities) assert.equal(sessionWarningToShow(OFFLINE, identity), undefined, identity.status);
  });

  test('no warning, nothing to show', () => {
    assert.equal(sessionWarningToShow(undefined, { status: 'error', message: OFFLINE }), undefined);
    assert.equal(sessionWarningToShow(undefined, null), undefined);
  });
});

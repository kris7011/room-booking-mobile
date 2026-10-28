import '../support/live-mode';

import assert from 'node:assert/strict';
import { afterEach, describe, mock, test } from 'node:test';

import {
  currentUserApi,
  shouldRecheckIdentity,
  verifyAndRegister,
  type ServerIdentity,
} from '../../src/api/current-user';
import { describeError } from '../../src/api/error-messages';
import { ACCESS_CHANGED_CODES, ACCOUNT_REFUSED_CODES, requestJson, setAccessChangedListener } from '../../src/api/http-client';
import type { CurrentUserResponse } from '../../src/models/current-user';

// An account disabled (or unregistered) while the app is open. Phase 5E (D8):
// the organisation panel reported the disabled account, but the account
// panel kept saying "✓ Registreret", because /api/me was asked only once per
// sign-in.

afterEach(() => {
  setAccessChangedListener(null);
  mock.restoreAll();
});

const VERIFIED: CurrentUserResponse = { displayName: 'Søren', username: null, tenantId: 'tenant', user: null };
const REGISTERED: ServerIdentity = {
  status: 'registered',
  identity: VERIFIED,
  user: { publicId: 'user-1', displayName: 'Søren', organizations: [] },
  registeredNow: false,
};

describe('shouldRecheckIdentity', () => {
  test('a registered identity is checked again when the account itself is refused', () => {
    assert.equal(shouldRecheckIdentity('user_disabled', REGISTERED), true);
    assert.equal(shouldRecheckIdentity('user_not_registered', REGISTERED), true);
  });

  test('a lost membership or role is the organisation list\'s business, not the identity\'s', () => {
    assert.equal(shouldRecheckIdentity('organization_not_found', REGISTERED), false);
    assert.equal(shouldRecheckIdentity('organization_permission_denied', REGISTERED), false);
  });

  test('no second check while one runs, or for an identity that is not shown as registered', () => {
    const others: (ServerIdentity | null)[] = [
      null,
      { status: 'checking' },
      { status: 'registering', identity: VERIFIED },
      { status: 'rejected', message: 'Din Room Booking-konto er deaktiveret.' },
      { status: 'error', message: 'offline' },
    ];
    for (const identity of others) {
      assert.equal(shouldRecheckIdentity('user_disabled', identity), false, identity?.status ?? 'null');
    }
  });

  test('the account codes are access-changed codes, so the HTTP client reports them', () => {
    for (const code of ACCOUNT_REFUSED_CODES) assert.ok(ACCESS_CHANGED_CODES.has(code), code);
  });
});

describe('an account disabled while the app is open', () => {
  test('one /api/me check follows, and the account is shown as disabled instead of registered', async () => {
    // The API as it is: every request of the disabled account, /api/me
    // included, is answered 403 user_disabled.
    const requested: string[] = [];
    mock.method(globalThis, 'fetch', async (url: string) => {
      requested.push(new URL(url).pathname);
      return new Response(JSON.stringify({ status: 403, code: 'user_disabled', title: 'Forbidden' }), {
        status: 403,
        headers: { 'Content-Type': 'application/problem+json' },
      });
    });

    // The wiring of useServerIdentity and SessionProvider, without React:
    // the identity shown, and the listener deciding with shouldRecheckIdentity.
    const shown: { identity: ServerIdentity | null } = { identity: REGISTERED };
    const checks: Promise<void>[] = [];
    setAccessChangedListener((code) => {
      if (!shouldRecheckIdentity(code, shown.identity)) return;
      shown.identity = { status: 'checking' };
      checks.push(
        verifyAndRegister(currentUserApi, describeError).then((result) => {
          shown.identity = result;
        }),
      );
    });

    await assert.rejects(requestJson('/api/organizations'));
    // The check's own 403 reached the listener too, while 'checking'. Bounded:
    // without that guard every answer would start another check, for ever.
    for (let round = 0; checks.length > 0 && round < 5; round++) await checks.shift();

    assert.deepEqual(requested, ['/api/organizations', '/api/me']);
    const { identity } = shown;
    assert.equal(identity?.status, 'rejected');
    assert.match(identity?.status === 'rejected' ? identity.message : '', /deaktiveret/);
  });
});

import { TEST_HTTPS_API_URL } from '../support/live-https-mode';

import assert from 'node:assert/strict';
import { afterEach, describe, mock, test } from 'node:test';

import {
  classifyCurrentUserError,
  describeOrganizationAccess,
  describeRole,
  registerCurrentUser,
  verifyAndRegister,
  type CurrentUserApi,
} from '../../src/api/current-user';
import { describeError } from '../../src/api/error-messages';
import { ApiError, setAccessTokenProvider } from '../../src/api/http-client';
import type { CurrentUserResponse, RegisteredUser, RegistrationResponse } from '../../src/models/current-user';

afterEach(() => {
  mock.restoreAll();
  setAccessTokenProvider(null);
});

const USER: RegisteredUser = {
  publicId: '6f1c2a3b-0000-4000-8000-000000000001',
  displayName: 'Søren',
  organizations: [],
};

const UNREGISTERED: CurrentUserResponse = {
  displayName: 'Søren',
  username: 'soren@outlook.example',
  tenantId: '9188040d-6c67-4c5b-b112-36a304b66dad',
  user: null,
};

const REGISTERED: CurrentUserResponse = { ...UNREGISTERED, user: USER };

/** A fake API that records which calls the flow made. */
function fakeApi(
  me: CurrentUserResponse | ApiError,
  registration: RegistrationResponse | ApiError = { created: true, currentUser: REGISTERED },
): CurrentUserApi & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async fetchCurrentUser() {
      calls.push('GET /api/me');
      if (me instanceof ApiError) throw me;
      return me;
    },
    async registerCurrentUser() {
      calls.push('POST /api/me/registration');
      if (registration instanceof ApiError) throw registration;
      return registration;
    },
  };
}

describe('POST /api/me/registration', () => {
  test('is a POST without a body, carrying the bearer token', async () => {
    setAccessTokenProvider({ getAccessGrant: async () => ({ accessToken: 'fake-access-1', isCurrent: () => true }) });
    const response: RegistrationResponse = { created: true, currentUser: REGISTERED };
    const fetchMock = mock.method(globalThis, 'fetch', async () =>
      new Response(JSON.stringify(response), { status: 201, headers: { 'Content-Type': 'application/json' } }),
    );

    assert.deepEqual(await registerCurrentUser(), response);

    const [url, init] = fetchMock.mock.calls[0].arguments as [string, RequestInit];
    assert.equal(url, `${TEST_HTTPS_API_URL}/api/me/registration`);
    assert.equal(init.method, 'POST');
    assert.equal(init.body, undefined);
    assert.equal((init.headers as Record<string, string>).Authorization, 'Bearer fake-access-1');
  });
});

describe('verifyAndRegister', () => {
  test('first login: verifies, then registers, and says the user is new', async () => {
    const api = fakeApi(UNREGISTERED);
    const progress: CurrentUserResponse[] = [];

    const result = await verifyAndRegister(api, describeError, (identity) => progress.push(identity));

    assert.deepEqual(api.calls, ['GET /api/me', 'POST /api/me/registration']);
    assert.deepEqual(progress, [UNREGISTERED]);
    assert.equal(result.status, 'registered');
    assert.ok(result.status === 'registered' && result.registeredNow);
    assert.ok(result.status === 'registered' && result.user.publicId === USER.publicId);
  });

  test('a returning user: one read-only GET, no registration call', async () => {
    const api = fakeApi(REGISTERED);

    const result = await verifyAndRegister(api, describeError, () => assert.fail('must not register'));

    assert.deepEqual(api.calls, ['GET /api/me']);
    assert.ok(result.status === 'registered' && !result.registeredNow);
  });

  test('registered meanwhile (another device or a second check): the API returns the existing user', async () => {
    const api = fakeApi(UNREGISTERED, { created: false, currentUser: REGISTERED });

    const result = await verifyAndRegister(api, describeError);

    assert.ok(result.status === 'registered' && !result.registeredNow);
    assert.ok(result.status === 'registered' && result.user.publicId === USER.publicId);
  });

  test('a disabled account is rejected with a message, at either step', async () => {
    const disabled = new ApiError('http', 'x', 403, { code: 'user_disabled', detail: 'This user account has been disabled.' });

    for (const api of [fakeApi(disabled), fakeApi(UNREGISTERED, disabled)]) {
      const result = await verifyAndRegister(api, describeError);
      assert.equal(result.status, 'rejected');
      assert.match(result.status === 'rejected' ? result.message : '', /deaktiveret/);
    }
  });

  test('an invalid token (401) is rejected without registering', async () => {
    const api = fakeApi(new ApiError('http', 'x', 401));

    const result = await verifyAndRegister(api, describeError);

    assert.deepEqual(api.calls, ['GET /api/me']);
    assert.equal(result.status, 'rejected');
  });

  test('an older API without the registration endpoint', async () => {
    for (const status of [404, 405]) {
      const result = await verifyAndRegister(fakeApi(UNREGISTERED, new ApiError('http', 'x', status)), describeError);
      assert.equal(result.status, 'registration-unsupported');
    }
  });

  test('a failed registration can be retried and keeps the verified identity', async () => {
    const result = await verifyAndRegister(fakeApi(UNREGISTERED, new ApiError('network', 'down')), describeError);

    assert.equal(result.status, 'registration-failed');
    assert.ok(result.status === 'registration-failed' && result.identity === UNREGISTERED);
    assert.match(result.status === 'registration-failed' ? result.message : '', /forbindelse/);
  });

  test('API without Entra settings', async () => {
    const result = await verifyAndRegister(
      fakeApi(new ApiError('http', 'x', 503, { code: 'authentication_not_configured' })),
      describeError,
    );
    assert.equal(result.status, 'not-configured');
  });
});

describe('organisation access', () => {
  test('no organisation: onboarding that offers creating one or accepting an invitation', () => {
    const access = describeOrganizationAccess(USER);
    assert.equal(access.title, 'Du er ikke medlem af en organisation endnu');
    assert.match(access.detail, /Opret din egen organisation/);
    assert.match(access.detail, /invitation/);
  });

  test('memberships are listed with Danish role names', () => {
    const access = describeOrganizationAccess({
      ...USER,
      organizations: [
        { publicId: 'a', name: 'Legacy', isLegacy: true, role: 'Owner' },
        { publicId: 'b', name: 'Acme', isLegacy: false, role: 'Member' },
      ],
    });
    assert.equal(access.title, 'Dine 2 organisationer');
    assert.equal(access.detail, 'Legacy (standardorganisation) · Ejer\nAcme · Medlem');
  });

  test('role names', () => {
    assert.equal(describeRole('Owner'), 'Ejer');
    assert.equal(describeRole('Admin'), 'Administrator');
    assert.equal(describeRole('Member'), 'Medlem');
    assert.equal(describeRole('Auditor'), 'Auditor');
  });

  test('user_disabled gets a Danish message instead of the API\'s English detail', () => {
    const result = classifyCurrentUserError(
      new ApiError('http', 'x', 403, { code: 'user_disabled', detail: 'This user account has been disabled.' }),
      describeError,
    );
    assert.ok(result.status === 'rejected' && /deaktiveret/.test(result.message));
  });
});

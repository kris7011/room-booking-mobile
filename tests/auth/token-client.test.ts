import assert from 'node:assert/strict';
import { describe, mock, test } from 'node:test';

import { AuthFlowError } from '../../src/auth/auth-errors';
import {
  parseTokenResponse,
  redeemAuthorizationCode,
  redeemRefreshToken,
  type FetchLike,
  type TokenClientConfig,
} from '../../src/auth/token-client';
import { NOW_MS, TEST_API_SCOPE, TEST_CLIENT_ID, TEST_REDIRECT_URI, TEST_TOKEN_ENDPOINT } from '../support/entra-fixtures';

const config: TokenClientConfig = {
  clientId: TEST_CLIENT_ID,
  tokenEndpoint: TEST_TOKEN_ENDPOINT,
  redirectUri: TEST_REDIRECT_URI,
  scopes: ['openid', 'profile', 'offline_access', TEST_API_SCOPE],
  apiScope: TEST_API_SCOPE,
};

const success = {
  token_type: 'Bearer',
  scope: `${TEST_API_SCOPE} openid profile offline_access`,
  expires_in: 3599,
  access_token: 'fake-access-token',
  refresh_token: 'fake-refresh-token',
  id_token: 'fake.id.token',
};

function respond(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  };
  return { fetch, calls };
}

const deps = (fetch: FetchLike) => ({ fetch, now: () => NOW_MS });

async function rejectsWithKind(promise: Promise<unknown>, kind: AuthFlowError['kind']) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof AuthFlowError, String(error));
    assert.equal(error.kind, kind);
    // Nothing secret ends up in an error message.
    assert.doesNotMatch(error.message, /fake-|code-from-entra|verifier-/);
    return true;
  });
}

describe('redeeming the authorization code', () => {
  test('POSTs the code with the PKCE verifier and no client secret', async () => {
    const { fetch, calls } = respond(200, success);
    await redeemAuthorizationCode(config, { code: 'code-from-entra', codeVerifier: 'verifier-123' }, deps(fetch));

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, TEST_TOKEN_ENDPOINT);
    assert.equal(calls[0].init.method, 'POST');
    assert.deepEqual(calls[0].init.headers, { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' });
    const form = Object.fromEntries(new URLSearchParams(String(calls[0].init.body)));
    assert.deepEqual(form, {
      grant_type: 'authorization_code',
      client_id: TEST_CLIENT_ID,
      code: 'code-from-entra',
      code_verifier: 'verifier-123',
      redirect_uri: TEST_REDIRECT_URI,
      scope: `openid profile offline_access ${TEST_API_SCOPE}`,
    });
    assert.ok(!('client_secret' in form));
  });

  test('returns the tokens with an absolute expiry measured from the request', async () => {
    const { fetch } = respond(200, success);
    assert.deepEqual(await redeemAuthorizationCode(config, { code: 'c', codeVerifier: 'v' }, deps(fetch)), {
      accessToken: 'fake-access-token',
      accessTokenExpiresAt: NOW_MS + 3599 * 1000,
      refreshToken: 'fake-refresh-token',
      idToken: 'fake.id.token',
    });
  });

  test('a redirect URI mismatch is a configuration error', async () => {
    const { fetch } = respond(400, { error: 'invalid_grant', error_description: 'AADSTS50011: The redirect URI does not match.' });
    await rejectsWithKind(redeemAuthorizationCode(config, { code: 'code-from-entra', codeVerifier: 'verifier-1' }, deps(fetch)), 'configuration');
  });

  test('a redirect registered as "Web" asks for a client secret → configuration error', async () => {
    const { fetch } = respond(401, { error: 'invalid_client', error_description: 'AADSTS7000218: client_assertion or client_secret required' });
    await rejectsWithKind(redeemAuthorizationCode(config, { code: 'c', codeVerifier: 'v' }, deps(fetch)), 'configuration');
  });
});

describe('refreshing', () => {
  test('POSTs the refresh token with the same scopes', async () => {
    const { fetch, calls } = respond(200, { ...success, refresh_token: 'fake-rotated' });
    const tokens = await redeemRefreshToken(config, 'fake-refresh-token', deps(fetch));
    const form = Object.fromEntries(new URLSearchParams(String(calls[0].init.body)));
    assert.equal(form.grant_type, 'refresh_token');
    assert.equal(form.refresh_token, 'fake-refresh-token');
    assert.equal(form.client_id, TEST_CLIENT_ID);
    assert.equal(form.scope, `openid profile offline_access ${TEST_API_SCOPE}`);
    assert.equal(tokens.refreshToken, 'fake-rotated');
  });

  test('an expired or revoked refresh token → session-expired', async () => {
    const { fetch } = respond(400, { error: 'invalid_grant', error_description: 'AADSTS700082: The refresh token has expired.' });
    await rejectsWithKind(redeemRefreshToken(config, 'fake-refresh-token', deps(fetch)), 'session-expired');
  });

  test('MFA or Conditional Access needing a new login → session-expired', async () => {
    const { fetch } = respond(400, { error: 'interaction_required', error_description: 'AADSTS50076: MFA required.' });
    await rejectsWithKind(redeemRefreshToken(config, 'fake-refresh-token', deps(fetch)), 'session-expired');
  });
});

describe('transport failures', () => {
  test('a rejected fetch → network, without the underlying message', async () => {
    const fetch: FetchLike = async () => {
      throw new TypeError('Network request failed: refresh_token=fake-refresh-token');
    };
    await rejectsWithKind(redeemRefreshToken(config, 'fake-refresh-token', deps(fetch)), 'network');
  });

  test('no answer within the timeout → timeout', async () => {
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const fetch: FetchLike = (_url, init) =>
        new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
      const pending = redeemRefreshToken(config, 'fake-refresh-token', { ...deps(fetch), timeoutMs: 15_000 });
      mock.timers.tick(15_000);
      await rejectsWithKind(pending, 'timeout');
    } finally {
      mock.timers.reset();
    }
  });

  test('a 503 without an OAuth body → server', async () => {
    const fetch: FetchLike = async () => new Response('<html>down</html>', { status: 503 });
    await rejectsWithKind(redeemRefreshToken(config, 'r', deps(fetch)), 'server');
  });
});

describe('parseTokenResponse', () => {
  test('rejects a response without an access token, a bearer type or a lifetime', () => {
    for (const body of [
      { ...success, access_token: undefined },
      { ...success, token_type: 'mac' },
      { ...success, expires_in: undefined },
      { ...success, expires_in: -1 },
    ]) {
      assert.throws(() => parseTokenResponse(body, TEST_API_SCOPE, NOW_MS), (error: unknown) => error instanceof AuthFlowError && error.kind === 'invalid-response');
    }
  });

  test('a token without the API scope → consent-required', () => {
    assert.throws(
      () => parseTokenResponse({ ...success, scope: 'openid profile offline_access' }, TEST_API_SCOPE, NOW_MS),
      (error: unknown) => error instanceof AuthFlowError && error.kind === 'consent-required',
    );
  });

  test('the scope may be listed without its api:// prefix, and expires_in as a string', () => {
    const tokens = parseTokenResponse({ ...success, scope: 'access_as_user openid', expires_in: '60' }, TEST_API_SCOPE, NOW_MS);
    assert.equal(tokens.accessTokenExpiresAt, NOW_MS + 60_000);
  });

  test('no refresh token (offline_access not granted) is allowed', () => {
    assert.equal(parseTokenResponse({ ...success, refresh_token: undefined }, TEST_API_SCOPE, NOW_MS).refreshToken, undefined);
  });
});

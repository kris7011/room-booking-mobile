import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { buildAuthorizeRequest } from '../../src/auth/authorize-request';
import { resolveEntraConfig, type EntraConfig } from '../../src/auth/entra-config';
import { TEST_API_SCOPE, TEST_CLIENT_ID, TEST_REDIRECT_URI } from '../support/entra-fixtures';

function config(tenant?: string): EntraConfig {
  const result = resolveEntraConfig({ clientId: TEST_CLIENT_ID, apiScope: TEST_API_SCOPE, tenant });
  assert.ok(result.configured);
  return result.config;
}

describe('buildAuthorizeRequest', () => {
  test('by default the common endpoint, so personal and work or school accounts can sign in', () => {
    assert.deepEqual(buildAuthorizeRequest(config(), TEST_REDIRECT_URI), {
      authorizationEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      clientId: TEST_CLIENT_ID,
      redirectUri: 'roombookingdev://auth',
      scopes: ['openid', 'profile', 'offline_access', TEST_API_SCOPE],
      usePKCE: true,
      prompt: 'select_account',
      extraParams: {},
    });
  });

  test('no account hint that would steer Microsoft to one kind of account', () => {
    const { extraParams } = buildAuthorizeRequest(config(), TEST_REDIRECT_URI);
    for (const hint of ['domain_hint', 'login_hint', 'tenant']) assert.equal(hint in extraParams, false, hint);
  });

  test('the configured tenant decides the endpoint', () => {
    assert.equal(
      buildAuthorizeRequest(config('organizations'), TEST_REDIRECT_URI).authorizationEndpoint,
      'https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize',
    );
  });

  test('the request gets its own copy of the scopes', () => {
    const entra = config();
    const request = buildAuthorizeRequest(entra, TEST_REDIRECT_URI);
    request.scopes.push('User.Read');
    assert.deepEqual(entra.scopes, ['openid', 'profile', 'offline_access', TEST_API_SCOPE]);
  });
});

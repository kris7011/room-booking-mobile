import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { describeAccount, describeSignInChoice, SIGN_IN_LABELS } from '../../src/auth/account-description';
import { describeExternalIdAvailability } from '../../src/auth/auth-availability';
import { AuthFlowError } from '../../src/auth/auth-errors';
import { buildExternalIdAuthorizeRequest } from '../../src/auth/authorize-request';
import { resolveExternalIdConfig, type ExternalIdConfig } from '../../src/auth/external-id-config';
import { readExternalIdTokenUser, readIdTokenUser, type AuthUser } from '../../src/auth/id-token';
import { NOW_MS, PERSONAL_TENANT_ID, TEST_CLIENT_ID, TEST_REDIRECT_URI, TEST_TENANT_ID, makeIdToken } from '../support/entra-fixtures';
import {
  EXTERNAL_API_SCOPE,
  EXTERNAL_CLIENT_ID,
  EXTERNAL_ISSUER,
  EXTERNAL_OBJECT_ID,
  EXTERNAL_TENANT_ID,
  externalIdSettings,
  makeExternalIdToken,
} from '../support/external-id-fixtures';

function configured(): ExternalIdConfig {
  const result = resolveExternalIdConfig(externalIdSettings);
  assert.ok(result.configured);
  return result.config;
}

function problemOf(raw: Parameters<typeof resolveExternalIdConfig>[0]): string {
  const result = resolveExternalIdConfig(raw);
  assert.equal(result.configured, false);
  return result.problem ?? '';
}

describe('External ID settings', () => {
  test('nothing set: e-mail sign-in is simply not offered, without a problem', () => {
    assert.deepEqual(resolveExternalIdConfig({}), { configured: false, problem: null });
    assert.deepEqual(resolveExternalIdConfig({ clientId: ' ', tenantId: '' }), { configured: false, problem: null });
  });

  test('the external tenant decides the endpoints, and its tenant ID the issuer', () => {
    assert.deepEqual(configured(), {
      clientId: EXTERNAL_CLIENT_ID,
      apiScope: EXTERNAL_API_SCOPE,
      tenantId: EXTERNAL_TENANT_ID,
      tenantSubdomain: 'roombookingtest',
      authorizationEndpoint: `https://roombookingtest.ciamlogin.com/${EXTERNAL_TENANT_ID}/oauth2/v2.0/authorize`,
      tokenEndpoint: `https://roombookingtest.ciamlogin.com/${EXTERNAL_TENANT_ID}/oauth2/v2.0/token`,
      scopes: ['openid', 'profile', 'offline_access', EXTERNAL_API_SCOPE],
      issuer: EXTERNAL_ISSUER,
    });
  });

  test('tenant ID and subdomain are normalised to lower case', () => {
    const result = resolveExternalIdConfig({
      ...externalIdSettings,
      tenantId: EXTERNAL_TENANT_ID.toUpperCase(),
      tenantSubdomain: ' RoomBookingTest ',
    });
    assert.ok(result.configured);
    assert.equal(result.config.tenantId, EXTERNAL_TENANT_ID);
    assert.equal(result.config.tenantSubdomain, 'roombookingtest');
  });

  test('each invalid value is named', () => {
    assert.match(problemOf({ ...externalIdSettings, clientId: 'my-app' }), /EXPO_PUBLIC_EXTERNAL_ID_CLIENT_ID/);
    assert.match(problemOf({ ...externalIdSettings, tenantId: 'roombookingtest.onmicrosoft.com' }), /EXPO_PUBLIC_EXTERNAL_ID_TENANT_ID/);
    assert.match(problemOf({ ...externalIdSettings, tenantSubdomain: 'roombookingtest.ciamlogin.com' }), /TENANT_SUBDOMAIN/);
    assert.match(problemOf({ ...externalIdSettings, tenantSubdomain: '' }), /TENANT_SUBDOMAIN/);
    assert.match(problemOf({ ...externalIdSettings, apiScope: '' }), /EXPO_PUBLIC_EXTERNAL_ID_API_SCOPE mangler/);
    assert.match(problemOf({ ...externalIdSettings, apiScope: 'access_as_user' }), /EXPO_PUBLIC_EXTERNAL_ID_API_SCOPE skal/);
  });

  test("a scope of the app's own registration is refused: its token would be for the app, not the API", () => {
    assert.match(
      problemOf({ ...externalIdSettings, apiScope: `api://${EXTERNAL_CLIENT_ID}/access_as_user` }),
      /EXPO_PUBLIC_EXTERNAL_ID_API_SCOPE peger på mobilappens egen registrering/,
    );
  });

  test('the development log names the endpoint or the problem, never a client ID', () => {
    const line = describeExternalIdAvailability(resolveExternalIdConfig(externalIdSettings));
    assert.match(line, /ciamlogin\.com/);
    assert.doesNotMatch(line, new RegExp(EXTERNAL_CLIENT_ID));
    assert.match(describeExternalIdAvailability(resolveExternalIdConfig({})), /not configured/);
    assert.match(describeExternalIdAvailability(resolveExternalIdConfig({ ...externalIdSettings, tenantId: 'x' })), /TENANT_ID/);
  });
});

describe('the e-mail authorization request', () => {
  test("the external tenant's endpoint and app, PKCE, and a fresh e-mail code every time", () => {
    assert.deepEqual(buildExternalIdAuthorizeRequest(configured(), TEST_REDIRECT_URI), {
      authorizationEndpoint: `https://roombookingtest.ciamlogin.com/${EXTERNAL_TENANT_ID}/oauth2/v2.0/authorize`,
      clientId: EXTERNAL_CLIENT_ID,
      redirectUri: 'roombookingdev://auth',
      scopes: ['openid', 'profile', 'offline_access', EXTERNAL_API_SCOPE],
      usePKCE: true,
      prompt: 'login',
      extraParams: {},
    });
  });
});

describe('readExternalIdTokenUser', () => {
  const expected = { clientId: EXTERNAL_CLIENT_ID, tenantId: EXTERNAL_TENANT_ID, issuer: EXTERNAL_ISSUER, nowMs: NOW_MS };

  function rejects(token: string, reason: RegExp) {
    assert.throws(
      () => readExternalIdTokenUser(token, expected),
      (error: unknown) => error instanceof AuthFlowError && error.kind === 'invalid-response' && reason.test(error.message),
    );
  }

  test('returns the e-mail user with the external tenant and object ID', () => {
    assert.deepEqual(readExternalIdTokenUser(makeExternalIdToken(), expected), {
      provider: 'external-id',
      name: 'Emma E-mail',
      username: 'emma@example.com',
      tenantId: EXTERNAL_TENANT_ID,
      objectId: EXTERNAL_OBJECT_ID,
    });
  });

  test('preferred_username wins over email for display; without either, a generic name', () => {
    assert.equal(readExternalIdTokenUser(makeExternalIdToken({ preferred_username: 'emma' }), expected).username, 'emma');
    const anonymous = readExternalIdTokenUser(makeExternalIdToken({ name: undefined, email: undefined }), expected);
    assert.equal(anonymous.name, 'E-mail-bruger');
    assert.equal(anonymous.username, null);
  });

  test('a token for another app, tenant or issuer is never shown as the user', () => {
    rejects(makeExternalIdToken({ aud: TEST_CLIENT_ID }), /another app/);
    rejects(makeExternalIdToken({ tid: TEST_TENANT_ID }), /another tenant/);
    rejects(makeExternalIdToken({ tid: undefined }), /another tenant/);
    // The subdomain host is the authority, not the issuer.
    rejects(makeExternalIdToken({ iss: `https://roombookingtest.ciamlogin.com/${EXTERNAL_TENANT_ID}/v2.0` }), /issuer/);
    rejects(makeExternalIdToken({ iss: `https://login.microsoftonline.com/${EXTERNAL_TENANT_ID}/v2.0` }), /issuer/);
  });

  test('expired, without object ID, or missing', () => {
    rejects(makeExternalIdToken({ exp: NOW_MS / 1000 - 3600 }), /expired/);
    rejects(makeExternalIdToken({ oid: undefined }), /object ID/);
    rejects('', /missing/);
  });

  test('a Microsoft ID token is not accepted as an e-mail sign-in, nor the other way round', () => {
    rejects(makeIdToken({ aud: EXTERNAL_CLIENT_ID }), /another tenant/);
    assert.throws(() =>
      readIdTokenUser(makeExternalIdToken({ aud: TEST_CLIENT_ID }), { clientId: TEST_CLIENT_ID, requiredTenantId: null, nowMs: NOW_MS }),
    );
  });
});

describe('account texts', () => {
  const user = (provider: AuthUser['provider'], tenantId: string): AuthUser => ({
    provider,
    name: 'N',
    username: null,
    tenantId,
    objectId: EXTERNAL_OBJECT_ID,
  });

  test('how the user signed in', () => {
    assert.equal(describeAccount(user('external-id', EXTERNAL_TENANT_ID)), 'Logget ind med e-mail-kode');
    assert.equal(describeAccount(user('entra', PERSONAL_TENANT_ID)), 'Logget ind med en personlig Microsoft-konto');
    assert.equal(describeAccount(user('entra', TEST_TENANT_ID)), 'Logget ind med en Microsoft arbejds- eller skolekonto');
  });

  test('the sign-in text mentions the e-mail code only when it is offered', () => {
    assert.doesNotMatch(describeSignInChoice(['entra'], false), /e-mail/);
    assert.match(describeSignInChoice(['entra', 'external-id'], false), /engangskode på e-mail/);
    assert.match(describeSignInChoice(['entra', 'external-id'], true), /demoen/);
    assert.equal(SIGN_IN_LABELS.entra, 'Log ind med Microsoft');
    assert.equal(SIGN_IN_LABELS['external-id'], 'Log ind med e-mail-kode');
  });
});

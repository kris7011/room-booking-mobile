import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { AuthFlowError } from '../../src/auth/auth-errors';
import { decodeBase64UrlUtf8, decodeJwtPayload, readIdTokenUser, type IdTokenExpectations } from '../../src/auth/id-token';
import {
  NOW_MS,
  OTHER_TENANT_ID,
  TEST_CLIENT_ID,
  TEST_OBJECT_ID,
  TEST_TENANT_ID,
  base64Url,
  makeIdToken,
  makeJwt,
} from '../support/entra-fixtures';

const expected: IdTokenExpectations = { clientId: TEST_CLIENT_ID, requiredTenantId: null, nowMs: NOW_MS };

function rejects(idToken: string | undefined, reason: RegExp, options = expected) {
  assert.throws(
    () => readIdTokenUser(idToken, options),
    (error: unknown) => error instanceof AuthFlowError && error.kind === 'invalid-response' && reason.test(error.message),
  );
}

describe('decoding', () => {
  test('base64url with Danish letters and without padding', () => {
    assert.equal(decodeBase64UrlUtf8(base64Url('Søren Ærø-Ågård ✓')), 'Søren Ærø-Ågård ✓');
    assert.equal(decodeBase64UrlUtf8(base64Url('a')), 'a');
  });

  test('a malformed token decodes to null instead of throwing', () => {
    for (const token of ['', 'abc', 'a.b', 'a.!!!.c', `x.${base64Url('not json')}.y`, `x.${base64Url('[1]')}.y`]) {
      assert.equal(decodeJwtPayload(token), null, token);
    }
  });
});

describe('readIdTokenUser', () => {
  test('returns name, username and the stable identity (tid, oid)', () => {
    assert.deepEqual(readIdTokenUser(makeIdToken(), expected), {
      name: 'Søren Ærø-Ågård',
      username: 'soren@contoso.example',
      tenantId: TEST_TENANT_ID,
      objectId: TEST_OBJECT_ID,
    });
  });

  test('falls back to the username, then a generic name', () => {
    assert.equal(readIdTokenUser(makeIdToken({ name: undefined }), expected).name, 'soren@contoso.example');
    const anonymous = readIdTokenUser(makeIdToken({ name: ' ', preferred_username: undefined }), expected);
    assert.equal(anonymous.name, 'Microsoft-bruger');
    assert.equal(anonymous.username, null);
  });

  test('missing or malformed → invalid response', () => {
    rejects(undefined, /missing/);
    rejects('not-a-jwt', /malformed/);
  });

  test('a token for another app is never shown as the user', () => {
    rejects(makeIdToken({ aud: '00000000-0000-4000-8000-000000000000' }), /another app/);
    assert.ok(readIdTokenUser(makeIdToken({ aud: [TEST_CLIENT_ID] }), expected));
  });

  test('the issuer must be the v2.0 issuer of the token\'s own tenant', () => {
    rejects(makeIdToken({ iss: `https://login.microsoftonline.com/${OTHER_TENANT_ID}/v2.0` }), /issuer/);
    rejects(makeIdToken({ iss: `https://sts.windows.net/${TEST_TENANT_ID}/` }), /issuer/);
    rejects(makeIdToken({ tid: 'organizations' }), /tenant/);
  });

  test('a required tenant rejects users of other tenants', () => {
    const limited = { ...expected, requiredTenantId: OTHER_TENANT_ID };
    rejects(makeIdToken(), /another tenant/, limited);
    assert.ok(readIdTokenUser(makeIdToken(), { ...expected, requiredTenantId: TEST_TENANT_ID }));
  });

  test('expired beyond the 5 minute clock skew → rejected; within it → accepted', () => {
    rejects(makeIdToken({ exp: NOW_MS / 1000 - 301 }), /expired/);
    rejects(makeIdToken({ exp: undefined }), /expired/);
    assert.ok(readIdTokenUser(makeIdToken({ exp: NOW_MS / 1000 - 299 }), expected));
  });

  test('without an object ID there is no stable identity', () => {
    // JSON.stringify leaves out undefined, so the claim is absent.
    rejects(makeIdToken({ oid: undefined }), /object ID/);
    rejects(makeJwt({ aud: TEST_CLIENT_ID }), /tenant/);
  });
});

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { AuthFlowError, describeAuthError, findAadstsCode, oauthError } from '../../src/auth/auth-errors';

describe('oauthError', () => {
  test('finds the AADSTS code and uses it to classify', () => {
    const description = 'AADSTS50011: The redirect URI specified in the request does not match. Trace ID: abc Correlation ID: def';
    assert.equal(findAadstsCode(description), 'AADSTS50011');
    const error = oauthError('invalid_request', description);
    assert.equal(error.kind, 'configuration');
    assert.equal(error.aadsts, 'AADSTS50011');
    // Trace and correlation IDs are not kept.
    assert.equal(error.message, 'invalid_request (AADSTS50011)');
  });

  test('common Entra failures get their own kind', () => {
    const cases: [string, string, AuthFlowError['kind']][] = [
      ['invalid_client', 'AADSTS7000218: The request body must contain client_assertion or client_secret.', 'configuration'],
      ['invalid_client', 'AADSTS700016: Application not found in the directory.', 'configuration'],
      ['invalid_grant', 'AADSTS65001: The user or administrator has not consented.', 'consent-required'],
      ['invalid_grant', 'AADSTS700082: The refresh token has expired due to inactivity.', 'session-expired'],
      ['invalid_grant', 'AADSTS50173: The provided grant has expired due to it being revoked.', 'session-expired'],
      ['access_denied', 'AADSTS65004: User declined to consent.', 'access-denied'],
      ['interaction_required', 'AADSTS50076: Due to a configuration change made by your administrator, you must use MFA.', 'session-expired'],
      ['temporarily_unavailable', '', 'server'],
      ['state_mismatch', 'Cross-Site request verification failed.', 'state-mismatch'],
      ['something_new', 'no code here', 'unknown'],
    ];
    for (const [code, description, kind] of cases) {
      assert.equal(oauthError(code, description).kind, kind, `${code} ${description}`);
    }
  });

  test('without a known AADSTS code the OAuth error decides', () => {
    assert.equal(oauthError('invalid_grant').kind, 'session-expired');
    assert.equal(oauthError('access_denied').kind, 'access-denied');
  });
});

describe('describeAuthError', () => {
  test('every kind has a Danish message', () => {
    const kinds: AuthFlowError['kind'][] = [
      'cancelled', 'access-denied', 'consent-required', 'configuration', 'state-mismatch', 'session-expired',
      'network', 'timeout', 'invalid-response', 'server', 'storage', 'busy', 'unknown',
    ];
    for (const kind of kinds) {
      const message = describeAuthError(new AuthFlowError(kind, 'x'));
      assert.ok(message.length > 10, kind);
      assert.doesNotMatch(message, /undefined/, kind);
    }
  });

  test('the AADSTS code is shown, so support can look it up', () => {
    assert.match(describeAuthError(oauthError('invalid_request', 'AADSTS50011: mismatch')), /sat korrekt op \(AADSTS50011\)/);
    assert.match(describeAuthError(oauthError('invalid_grant')), /udløbet/);
  });

  test('anything else gets a generic message', () => {
    assert.match(describeAuthError(new Error('boom')), /uventet fejl/);
  });
});

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { describeAuthAvailability, describeUnavailable, resolveAuthAvailability } from '../../src/auth/auth-availability';
import { resolveEntraConfig } from '../../src/auth/entra-config';
import { TEST_API_SCOPE, TEST_CLIENT_ID, TEST_TENANT_ID } from '../support/entra-fixtures';

const configured = resolveEntraConfig({ clientId: TEST_CLIENT_ID, apiScope: TEST_API_SCOPE });

test('Android development build with settings → login available', () => {
  const availability = resolveAuthAvailability('android', configured, 'roombookingdev://auth');
  assert.equal(availability.available, true);
});

test('web never offers login, even with settings', () => {
  assert.deepEqual(resolveAuthAvailability('web', configured, null), { available: false, reason: 'web' });
});

test('no settings → runs without login (demo mode keeps working)', () => {
  assert.deepEqual(resolveAuthAvailability('android', resolveEntraConfig({}), 'roombookingdev://auth'), {
    available: false,
    reason: 'not-configured',
  });
});

test('invalid settings → disabled with the reason', () => {
  const availability = resolveAuthAvailability('android', resolveEntraConfig({ clientId: TEST_CLIENT_ID }), 'roombookingdev://auth');
  assert.equal(availability.available, false);
  assert.equal(!availability.available && availability.reason, 'invalid-config');
  assert.match(!availability.available ? describeUnavailable(availability.reason, availability.detail) : '', /API_SCOPE mangler/);
});

test('Expo Go (exp:// redirect) → disabled instead of failing with AADSTS50011', () => {
  const availability = resolveAuthAvailability('android', configured, 'exp://192.168.1.20:8081/--/auth');
  assert.equal(!availability.available && availability.reason, 'expo-go');
  assert.match(describeUnavailable('expo-go'), /development build/);
});

test('Expo Go is refused even when the redirect URI looks like the development build\'s', () => {
  // Seen on a Samsung with Expo Go 58: the redirect URI was roombookingdev://auth,
  // so the login opened, although Microsoft redirects to the development build.
  const availability = resolveAuthAvailability('android', configured, 'roombookingdev://auth', true);
  assert.equal(!availability.available && availability.reason, 'expo-go');
  assert.match(describeUnavailable('expo-go'), /virker ikke i Expo Go/);
  assert.match(describeUnavailable('expo-go'), /Room Booking/);
});

test('the development build is not mistaken for Expo Go', () => {
  assert.equal(resolveAuthAvailability('android', configured, 'roombookingdev://auth', false).available, true);
});

test('the development log names the login page and the accounts it accepts, never the client ID', () => {
  const common = describeAuthAvailability(resolveAuthAvailability('android', configured, 'roombookingdev://auth'));
  assert.equal(
    common,
    '[auth] Microsoft login: https://login.microsoftonline.com/common/oauth2/v2.0/authorize ' +
      '(personal Microsoft accounts and work or school accounts)',
  );

  const organizations = resolveEntraConfig({ clientId: TEST_CLIENT_ID, apiScope: TEST_API_SCOPE, tenant: 'organizations' });
  const orgLine = describeAuthAvailability(resolveAuthAvailability('android', organizations, 'roombookingdev://auth'));
  assert.match(orgLine, /\/organizations\/oauth2\/v2\.0\/authorize/);
  assert.match(orgLine, /refuses personal accounts/);

  const oneTenant = resolveEntraConfig({ clientId: TEST_CLIENT_ID, apiScope: TEST_API_SCOPE, tenant: TEST_TENANT_ID });
  const tenantLine = describeAuthAvailability(resolveAuthAvailability('android', oneTenant, 'roombookingdev://auth'));
  assert.match(tenantLine, /refuses personal accounts/);

  for (const line of [common, orgLine]) assert.doesNotMatch(line, new RegExp(TEST_CLIENT_ID));

  assert.equal(
    describeAuthAvailability(resolveAuthAvailability('android', configured, 'roombookingdev://auth', true)),
    '[auth] Microsoft login unavailable: expo-go (roombookingdev://auth)',
  );
});

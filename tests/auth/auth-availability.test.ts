import assert from 'node:assert/strict';
import { test } from 'node:test';

import { describeUnavailable, resolveAuthAvailability } from '../../src/auth/auth-availability';
import { resolveEntraConfig } from '../../src/auth/entra-config';
import { TEST_API_SCOPE, TEST_CLIENT_ID } from '../support/entra-fixtures';

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

import '../support/demo-mode';

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { describeError } from '../../src/api/error-messages';
import { ApiError, buildUrl, requestJson } from '../../src/api/http-client';

// Guards against accidentally calling the real API while in demo mode.
test('without an API URL the HTTP client refuses to build URLs', () => {
  assert.throws(
    () => buildUrl('/api/rooms'),
    (error: unknown) => error instanceof ApiError && error.kind === 'not-configured',
  );
});

test('requestJson rejects instead of calling fetch', async () => {
  await assert.rejects(requestJson('/api/rooms'), (error: unknown) => {
    assert.ok(error instanceof ApiError);
    assert.equal(describeError(error), 'EXPO_PUBLIC_API_URL er ikke sat.');
    return true;
  });
});

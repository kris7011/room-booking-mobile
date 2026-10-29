import { TEST_HTTPS_API_URL } from '../support/live-https-mode';

import assert from 'node:assert/strict';
import { afterEach, describe, mock, test } from 'node:test';

import { ApiError, setAccessTokenProvider, type AccessGrant } from '../../src/api/http-client';
import { identityLinksApi } from '../../src/api/identity-links-api';

afterEach(() => {
  mock.restoreAll();
  setAccessTokenProvider(null);
});

function stubFetch(status: number, body: unknown = {}) {
  return mock.method(globalThis, 'fetch', async () =>
    new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  );
}

function request(fetchMock: ReturnType<typeof stubFetch>, index = 0): { url: string; init: RequestInit } {
  const [url, init] = fetchMock.mock.calls[index].arguments as [string, RequestInit];
  return { url, init };
}

const sessionGrant: AccessGrant = { accessToken: 'session-token', isCurrent: () => true };
const secondGrant: AccessGrant = { accessToken: 'second-identity-token', isCurrent: () => true };

describe('identity links API', () => {
  test("start, confirm and cancel go out with the session's token", async () => {
    setAccessTokenProvider({ getAccessGrant: async () => sessionGrant });
    const fetchMock = stubFetch(201, { linkId: 'l1', code: 'c', expiresUtc: '2031-03-01T10:10:00Z' });

    await identityLinksApi.start();

    const { url, init } = request(fetchMock);
    assert.equal(url, `${TEST_HTTPS_API_URL}/api/me/identity-links`);
    assert.equal(init.method, 'POST');
    assert.equal((init.headers as Record<string, string>).Authorization, 'Bearer session-token');
  });

  test("the claim goes out with the second identity's token, never the session's", async () => {
    const session = mock.fn(async () => sessionGrant);
    setAccessTokenProvider({ getAccessGrant: session });
    const fetchMock = stubFetch(200, { linkId: 'l1', accountDisplayName: 'Kris', provider: 'ExternalId', expiresUtc: 'x' });

    const claimed = await identityLinksApi.claim('the-code', secondGrant);

    const { url, init } = request(fetchMock);
    assert.equal(url, `${TEST_HTTPS_API_URL}/api/identity-links/claim`);
    assert.equal((init.headers as Record<string, string>).Authorization, 'Bearer second-identity-token');
    assert.deepEqual(JSON.parse(init.body as string), { code: 'the-code' });
    assert.equal(session.mock.callCount(), 0);
    assert.equal(claimed.accountDisplayName, 'Kris');
  });

  test('a refused claim is not retried with a renewed token', async () => {
    const fetchMock = stubFetch(401, {});

    await assert.rejects(identityLinksApi.claim('the-code', secondGrant), (error: unknown) => error instanceof ApiError && error.status === 401);
    assert.equal(fetchMock.mock.callCount(), 1);
  });

  test('a claim whose session ended is not sent at all', async () => {
    const fetchMock = stubFetch(200, {});

    await assert.rejects(identityLinksApi.claim('the-code', { accessToken: 't', isCurrent: () => false }), ApiError);
    assert.equal(fetchMock.mock.callCount(), 0);
  });

  test('confirm and cancel name the request in the path; cancel accepts 204', async () => {
    setAccessTokenProvider({ getAccessGrant: async () => sessionGrant });
    const fetchMock = stubFetch(204);

    await identityLinksApi.cancel('a/b');

    const { url, init } = request(fetchMock);
    assert.equal(url, `${TEST_HTTPS_API_URL}/api/me/identity-links/a%2Fb`);
    assert.equal(init.method, 'DELETE');
  });
});

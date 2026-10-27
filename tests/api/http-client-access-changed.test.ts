import { TEST_API_URL } from '../support/live-mode';

import assert from 'node:assert/strict';
import { afterEach, describe, mock, test } from 'node:test';

import { ApiError, requestJson, setAccessChangedListener } from '../../src/api/http-client';
import { describeOrganizationNotice } from '../../src/organizations/organization-messages';

// The signal that lets the organisation list catch up when any API answer
// says the user's access changed (removed, demoted, disabled).

afterEach(() => {
  setAccessChangedListener(null);
  mock.restoreAll();
});

function answer(status: number, body: Record<string, unknown>) {
  mock.method(globalThis, 'fetch', async () =>
    new Response(JSON.stringify({ status, ...body }), { status, headers: { 'Content-Type': 'application/problem+json' } }),
  );
}

describe('setAccessChangedListener', () => {
  for (const [status, code] of [
    [404, 'organization_not_found'],
    [403, 'organization_permission_denied'],
    [403, 'user_disabled'],
    [403, 'user_not_registered'],
  ] as const) {
    test(`${status} ${code} tells the listener, and the request still rejects with it`, async () => {
      const heard: string[] = [];
      setAccessChangedListener((heardCode) => heard.push(heardCode));
      answer(status, { code, title: 'x' });

      await assert.rejects(requestJson(`/api/organizations/abc/bookings`), (error: unknown) => {
        assert.ok(error instanceof ApiError);
        assert.equal(error.problem?.code, code);
        return true;
      });
      assert.deepEqual(heard, [code]);
    });
  }

  for (const [status, body] of [
    [409, { code: 'booking_overlap' }],
    [403, { code: 'booking_permission_denied' }],
    [404, { title: 'Not Found' }],
    [500, { title: 'Server error' }],
  ] as const) {
    test(`${status} ${'code' in body ? body.code : 'without a code'} does not`, async () => {
      const heard: string[] = [];
      setAccessChangedListener((code) => heard.push(code));
      answer(status, body);

      await assert.rejects(requestJson('/api/bookings'));
      assert.deepEqual(heard, []);
    });
  }

  test('a failing listener does not replace the request error', async () => {
    setAccessChangedListener(() => {
      throw new Error('listener broke');
    });
    answer(404, { code: 'organization_not_found' });

    await assert.rejects(requestJson('/api/organizations/abc'), (error: unknown) => error instanceof ApiError && error.status === 404);
  });

  test('without a listener nothing happens', async () => {
    answer(403, { code: 'user_disabled' });
    await assert.rejects(requestJson('/api/organizations'), ApiError);
    assert.ok(TEST_API_URL);
  });
});

describe('describeOrganizationNotice', () => {
  const acme = { publicId: 'a', name: 'Acme', isLegacy: false, role: 'Member' as const };

  test('lost access with another organisation to fall back to', () => {
    assert.deepEqual(describeOrganizationNotice({ kind: 'access-removed', organizationName: 'Legacy' }, acme), {
      title: 'Du har ikke længere adgang til Legacy',
      message: 'Du er fjernet fra organisationen, eller den er slettet. Appen viser nu Acme.',
    });
  });

  test('lost access to the last organisation', () => {
    const text = describeOrganizationNotice({ kind: 'access-removed', organizationName: 'Legacy' }, null);
    assert.match(text.message, /Opret en organisation, eller accepter en invitation/);
  });

  test('a new role', () => {
    assert.deepEqual(describeOrganizationNotice({ kind: 'role-changed', organizationName: 'Acme', role: 'Member' }, acme), {
      title: 'Din rolle i Acme er ændret',
      message: 'Du er nu medlem. Appen viser kun det, din nye rolle giver adgang til.',
    });
  });
});

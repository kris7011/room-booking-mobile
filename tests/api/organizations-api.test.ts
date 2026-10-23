import { TEST_HTTPS_API_URL } from '../support/live-https-mode';

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, mock, test } from 'node:test';

import { ApiError, setAccessTokenProvider } from '../../src/api/http-client';
import { liveOrganizationsApi, organizationPath, organizationRoomBookingApi } from '../../src/api/organizations-api';
import { roomBookingApi, roomBookingApiFor } from '../../src/api/room-booking-api';

// The organisation endpoints against stubbed fetch: the paths and bodies
// the .NET API expects, the access token on every request, and the
// Idempotency-Key on organisation creation. No request leaves the process.

const ACME = '11111111-1111-4111-8111-111111111111';
const ZETA = '22222222-2222-4222-8222-222222222222';

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

let calls: Call[] = [];

function stubFetch(respond: (call: Call) => Response) {
  mock.method(globalThis, 'fetch', async (input: string | URL | Request, init: RequestInit = {}) => {
    const call: Call = {
      url: String(input),
      method: init.method ?? 'GET',
      headers: init.headers as Record<string, string>,
      body: init.body ? JSON.parse(String(init.body)) : undefined,
    };
    calls.push(call);
    return respond(call);
  });
}

function json(status: number, body: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': status >= 400 ? 'application/problem+json' : 'application/json' },
  });
}

beforeEach(() => {
  calls = [];
  setAccessTokenProvider({ getAccessGrant: async () => ({ accessToken: 'fake-access', isCurrent: () => true }) });
});

afterEach(() => {
  mock.restoreAll();
  setAccessTokenProvider(null);
});

describe('organisations', () => {
  test('creating sends the name, the Idempotency-Key and the access token', async () => {
    stubFetch(() => json(201, { publicId: ACME, name: 'Acme', isLegacy: false, role: 'Owner' }));

    const created = await liveOrganizationsApi.create('Acme', 'key-1');

    assert.equal(created.role, 'Owner');
    assert.equal(calls[0].url, `${TEST_HTTPS_API_URL}/api/organizations`);
    assert.equal(calls[0].method, 'POST');
    assert.deepEqual(calls[0].body, { name: 'Acme' });
    assert.equal(calls[0].headers['Idempotency-Key'], 'key-1');
    assert.equal(calls[0].headers.Authorization, 'Bearer fake-access');
  });

  test('a repeated request sends the same key (the API answers 200 with the same organisation)', async () => {
    stubFetch((call) =>
      json(calls.length === 1 ? 201 : 200, { publicId: ACME, name: 'Acme', isLegacy: false, role: 'Owner', key: call.headers['Idempotency-Key'] }),
    );

    const first = await liveOrganizationsApi.create('Acme', 'same-key');
    const second = await liveOrganizationsApi.create('Acme', 'same-key');

    assert.equal(first.publicId, second.publicId);
    assert.deepEqual(calls.map((call) => call.headers['Idempotency-Key']), ['same-key', 'same-key']);
  });

  test('an extra header can never replace the access token', async () => {
    stubFetch(() => json(200, []));
    await liveOrganizationsApi.list();
    assert.equal(calls[0].headers.Authorization, 'Bearer fake-access');
  });

  test('the organisation ID is encoded, so it can never change the path', () => {
    assert.equal(organizationPath('../../api/rooms'), '/api/organizations/..%2F..%2Fapi%2Frooms');
  });

  test('problems keep their code, for the Danish messages', async () => {
    stubFetch(() => json(422, { status: 422, code: 'idempotency_key_reused', title: 'x' }));
    await assert.rejects(liveOrganizationsApi.create('Other', 'key'), (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.problem?.code, 'idempotency_key_reused');
      return true;
    });
  });
});

describe('administration endpoints', () => {
  test('rooms, members and invitations use the organisation in the path', async () => {
    stubFetch((call) => (call.method === 'DELETE' ? json(204, undefined) : json(200, call.method === 'GET' ? [] : {})));

    await liveOrganizationsApi.listRooms(ACME, { includeArchived: true });
    await liveOrganizationsApi.createRoom(ACME, { name: 'Sal', capacity: 10 });
    await liveOrganizationsApi.updateRoom(ACME, 5, { name: 'Sal 2', capacity: 12 });
    await liveOrganizationsApi.archiveRoom(ACME, 5);
    await liveOrganizationsApi.restoreRoom(ACME, 5);
    await liveOrganizationsApi.listMembers(ACME);
    await liveOrganizationsApi.changeRole(ACME, 'user-1', 'Admin');
    await liveOrganizationsApi.removeMember(ACME, 'user-1');
    await liveOrganizationsApi.listInvitations(ACME);
    await liveOrganizationsApi.invite(ACME, 'a@example.com', 'Member');
    await liveOrganizationsApi.revokeInvitation(ACME, 7);
    await liveOrganizationsApi.acceptInvitation('secret-token');

    const prefix = `${TEST_HTTPS_API_URL}/api/organizations/${ACME}`;
    assert.deepEqual(
      calls.map((call) => `${call.method} ${call.url}`),
      [
        `GET ${prefix}/rooms?includeArchived=true`,
        `POST ${prefix}/rooms`,
        `PUT ${prefix}/rooms/5`,
        `POST ${prefix}/rooms/5/archive`,
        `POST ${prefix}/rooms/5/restore`,
        `GET ${prefix}/members`,
        `PUT ${prefix}/members/user-1/role`,
        `DELETE ${prefix}/members/user-1`,
        `GET ${prefix}/invitations`,
        `POST ${prefix}/invitations`,
        `DELETE ${prefix}/invitations/7`,
        `POST ${TEST_HTTPS_API_URL}/api/invitations/accept`,
      ],
    );
    assert.deepEqual(calls[6].body, { role: 'Admin' });
    assert.deepEqual(calls[9].body, { email: 'a@example.com', role: 'Member' });
    assert.deepEqual(calls[11].body, { token: 'secret-token' });
    assert.ok(calls.every((call) => call.headers.Authorization === 'Bearer fake-access'));
  });
});

describe('booking per organisation', () => {
  test('search and booking go to the chosen organisation, never the original endpoints', async () => {
    stubFetch((call) => (call.method === 'POST' ? json(201, { id: 1 }) : json(200, [{ id: 3, name: 'Sal', capacity: 8, archivedUtc: null }])));
    const api = organizationRoomBookingApi(ACME);

    assert.deepEqual(await api.getRooms(), [{ id: 3, name: 'Sal', capacity: 8 }]);
    await api.getAvailableRooms({ startUtc: '2031-01-01T09:00:00.000Z', endUtc: '2031-01-01T10:00:00.000Z', minCapacity: 4 });
    await api.createBooking({ roomId: 3, title: 'Møde', bookedBy: 'Kris', startUtc: '2031-01-01T09:00:00.000Z', endUtc: '2031-01-01T10:00:00.000Z' });
    await api.listBookings!('2031-01-01T00:00:00.000Z');

    const paths = calls.map((call) => new URL(call.url).pathname);
    assert.deepEqual(paths, [
      `/api/organizations/${ACME}/rooms`,
      `/api/organizations/${ACME}/rooms/available`,
      `/api/organizations/${ACME}/bookings`,
      `/api/organizations/${ACME}/bookings`,
    ]);
    assert.equal(new URL(calls[1].url).searchParams.get('minCapacity'), '4');
    assert.equal(new URL(calls[3].url).searchParams.get('fromUtc'), '2031-01-01T00:00:00.000Z');
  });

  test('switching organisation switches every request; the previous one is never asked again', async () => {
    stubFetch(() => json(200, []));

    await roomBookingApiFor(ACME).getRooms();
    await roomBookingApiFor(ZETA).getRooms();
    await roomBookingApiFor(ZETA).listBookings!('2031-01-01T00:00:00.000Z');

    assert.deepEqual(
      calls.map((call) => new URL(call.url).pathname),
      [`/api/organizations/${ACME}/rooms`, `/api/organizations/${ZETA}/rooms`, `/api/organizations/${ZETA}/bookings`],
    );
  });

  test('without an organisation the original endpoints are used', () => {
    assert.equal(roomBookingApiFor(null), roomBookingApi);
  });

  test('deleting a booking', async () => {
    stubFetch(() => json(204, undefined));
    await organizationRoomBookingApi(ACME).deleteBooking!(42);
    assert.equal(calls[0].method, 'DELETE');
    assert.equal(new URL(calls[0].url).pathname, `/api/organizations/${ACME}/bookings/42`);
  });
});

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { ApiError } from '../../src/api/http-client';
import type { Organization } from '../../src/models/organization';
import {
  OrganizationController,
  selectionKey,
  type OrganizationsState,
} from '../../src/organizations/organization-controller';
import { MemoryStore } from '../support/memory-store';

const LEGACY: Organization = { publicId: 'bf2b2b52-fb51-4871-b2d7-43d8e25a9e47', name: 'Legacy', isLegacy: true, role: 'Owner' };
const ACME: Organization = { publicId: '11111111-1111-4111-8111-111111111111', name: 'Acme', isLegacy: false, role: 'Member' };
const ZETA: Organization = { publicId: '22222222-2222-4222-8222-222222222222', name: 'Zeta', isLegacy: false, role: 'Admin' };

const USER = 'aaaaaaaa-0000-4000-8000-000000000001';
const OTHER_USER = 'bbbbbbbb-0000-4000-8000-000000000002';

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** A list endpoint whose answers the test hands out one by one. */
function fakeApi() {
  const pending: Deferred<Organization[]>[] = [];
  return {
    pending,
    api: {
      list() {
        const next = deferred<Organization[]>();
        pending.push(next);
        return next.promise;
      },
    },
  };
}

function create(store: MemoryStore | null = new MemoryStore()) {
  const { api, pending } = fakeApi();
  const controller = new OrganizationController({ api, store, describe: (error) => `described: ${String(error)}` });
  const states: OrganizationsState[] = [];
  controller.subscribe((state) => states.push(state));
  return { controller, pending, states, store };
}

function ready(state: OrganizationsState) {
  assert.equal(state.status, 'ready');
  return state as Extract<OrganizationsState, { status: 'ready' }>;
}

async function settle() {
  for (let index = 0; index < 5; index++) await new Promise((resolve) => setImmediate(resolve));
}

describe('loading', () => {
  test('starts inactive, loads the list sorted by name and picks the first', async () => {
    const { controller, pending, states } = create();
    assert.equal(controller.getState().status, 'inactive');

    const done = controller.activate(USER);
    assert.equal(controller.getState().status, 'loading');
    pending[0].resolve([ZETA, LEGACY, ACME]);
    await done;

    const state = ready(controller.getState());
    assert.deepEqual(state.organizations.map((organization) => organization.name), ['Acme', 'Legacy', 'Zeta']);
    assert.equal(state.active?.publicId, ACME.publicId);
    assert.deepEqual(states.map((s) => s.status), ['loading', 'ready']);
  });

  test('no organisations: ready without an active one, so the app shows onboarding', async () => {
    const { controller, pending } = create();
    const done = controller.activate(USER);
    pending[0].resolve([]);
    await done;

    const state = ready(controller.getState());
    assert.deepEqual(state.organizations, []);
    assert.equal(state.active, null);
  });

  test('a failed first load is an error with a message; a retry recovers', async () => {
    const { controller, pending } = create();
    const done = controller.activate(USER);
    pending[0].reject(new ApiError('network', 'down'));
    await done;
    assert.equal(controller.getState().status, 'error');

    const retry = controller.refresh();
    pending[1].resolve([ACME]);
    await retry;
    assert.equal(ready(controller.getState()).active?.publicId, ACME.publicId);
  });

  test('a failed refresh keeps the list it has', async () => {
    const { controller, pending } = create();
    const first = controller.activate(USER);
    pending[0].resolve([ACME, LEGACY]);
    await first;

    const refresh = controller.refresh();
    pending[1].reject(new ApiError('timeout', 'slow'));
    await refresh;
    assert.equal(ready(controller.getState()).organizations.length, 2);
  });

  test('an API without /api/organizations (404 without a code) falls back to what /api/me said', async () => {
    const { controller, pending } = create();
    const done = controller.activate(USER, [LEGACY]);
    pending[0].reject(new ApiError('http', 'Not found', 404, { status: 404, title: 'Not Found' }));
    await done;
    assert.equal(ready(controller.getState()).active?.publicId, LEGACY.publicId);
  });

  test('organization_not_found is not mistaken for a missing endpoint', async () => {
    const { controller, pending } = create();
    const done = controller.activate(USER, [LEGACY]);
    pending[0].reject(new ApiError('http', 'x', 404, { code: 'organization_not_found' }));
    await done;
    assert.equal(controller.getState().status, 'error');
  });
});

describe('switching', () => {
  test('select changes the active organisation and remembers it per user', async () => {
    const { controller, pending, store } = create();
    const done = controller.activate(USER);
    pending[0].resolve([LEGACY, ACME]);
    await done;

    controller.select(LEGACY.publicId);
    assert.equal(ready(controller.getState()).active?.publicId, LEGACY.publicId);
    await settle();
    assert.equal(store!.values.get(selectionKey(USER)), LEGACY.publicId);
  });

  test('the remembered organisation is chosen again after a restart', async () => {
    const store = new MemoryStore();
    await store.setItem(selectionKey(USER), ZETA.publicId);

    const { controller, pending } = create(store);
    const done = controller.activate(USER);
    pending[0].resolve([ACME, ZETA]);
    await done;
    assert.equal(ready(controller.getState()).active?.publicId, ZETA.publicId);
  });

  test('a remembered organisation the user has left is ignored', async () => {
    const store = new MemoryStore();
    await store.setItem(selectionKey(USER), ZETA.publicId);

    const { controller, pending } = create(store);
    const done = controller.activate(USER);
    pending[0].resolve([ACME]);
    await done;
    assert.equal(ready(controller.getState()).active?.publicId, ACME.publicId);
  });

  test('selecting an organisation the user is not in changes nothing', async () => {
    const { controller, pending, states } = create();
    const done = controller.activate(USER);
    pending[0].resolve([ACME]);
    await done;
    const count = states.length;

    controller.select('not-mine');
    controller.select(ACME.publicId);
    assert.equal(states.length, count);
    assert.equal(ready(controller.getState()).active?.publicId, ACME.publicId);
  });

  test('a broken keystore only costs remembering the choice', async () => {
    const store = new MemoryStore();
    store.failReads = true;
    store.failWrites = true;

    const { controller, pending } = create(store);
    const done = controller.activate(USER);
    pending[0].resolve([ACME, LEGACY]);
    await done;
    controller.select(LEGACY.publicId);
    await settle();
    assert.equal(ready(controller.getState()).active?.publicId, LEGACY.publicId);
  });

  test('a refresh keeps the organisation the user is working in', async () => {
    const { controller, pending } = create();
    const first = controller.activate(USER);
    pending[0].resolve([ACME, LEGACY]);
    await first;
    controller.select(LEGACY.publicId);

    const refresh = controller.refresh();
    pending[1].resolve([ACME, LEGACY, ZETA]);
    await refresh;
    assert.equal(ready(controller.getState()).active?.publicId, LEGACY.publicId);
  });
});

describe('stale data', () => {
  test('an older list arriving after a newer one is dropped', async () => {
    const { controller, pending } = create();
    const first = controller.activate(USER);
    const second = controller.refresh();

    pending[1].resolve([ACME, ZETA]);
    await second;
    pending[0].resolve([LEGACY]);
    await first;

    assert.deepEqual(
      ready(controller.getState()).organizations.map((organization) => organization.publicId),
      [ACME.publicId, ZETA.publicId],
    );
  });

  test("the previous user's list never shows for the next user", async () => {
    const { controller, pending } = create();
    const firstUser = controller.activate(USER);
    controller.deactivate();
    const secondUser = controller.activate(OTHER_USER);

    pending[0].resolve([LEGACY, ACME]);
    await firstUser;
    assert.equal(controller.getState().status, 'loading');

    pending[1].resolve([ZETA]);
    await secondUser;
    assert.deepEqual(ready(controller.getState()).organizations, [ZETA]);
  });

  test('signing out clears the organisations, and a late answer is ignored', async () => {
    const { controller, pending } = create();
    const done = controller.activate(USER);
    controller.deactivate();
    pending[0].resolve([ACME]);
    await done;
    assert.equal(controller.getState().status, 'inactive');
    assert.equal(controller.active, null);
  });

  test("users' choices are remembered separately", async () => {
    const store = new MemoryStore();
    const { controller, pending } = create(store);
    const first = controller.activate(USER);
    pending[0].resolve([ACME, LEGACY]);
    await first;
    controller.select(LEGACY.publicId);
    await settle();

    controller.deactivate();
    const second = controller.activate(OTHER_USER);
    pending[1].resolve([ACME, LEGACY]);
    await second;
    assert.equal(ready(controller.getState()).active?.publicId, ACME.publicId);
  });
});

describe('membership changes', () => {
  test('a created or joined organisation is added and becomes active', async () => {
    const { controller, pending } = create();
    const done = controller.activate(USER);
    pending[0].resolve([]);
    await done;

    controller.added({ ...ZETA, role: 'Owner' });
    const state = ready(controller.getState());
    assert.equal(state.active?.publicId, ZETA.publicId);
    assert.equal(state.active?.role, 'Owner');
    assert.equal(state.organizations.length, 1);

    // Adding it again (a repeated create) does not duplicate it.
    controller.added({ ...ZETA, role: 'Owner' });
    assert.equal(ready(controller.getState()).organizations.length, 1);
  });

  test('leaving the active organisation falls back to another, or to onboarding', async () => {
    const { controller, pending } = create();
    const done = controller.activate(USER);
    pending[0].resolve([ACME, LEGACY]);
    await done;

    controller.removed(ACME.publicId);
    assert.equal(ready(controller.getState()).active?.publicId, LEGACY.publicId);

    controller.removed(LEGACY.publicId);
    assert.equal(ready(controller.getState()).active, null);
  });

  test('a renamed organisation is updated in place', async () => {
    const { controller, pending } = create();
    const done = controller.activate(USER);
    pending[0].resolve([ACME, ZETA]);
    await done;

    controller.updated({ ...ACME, name: 'Acme Robotics' });
    const state = ready(controller.getState());
    assert.equal(state.active?.name, 'Acme Robotics');
    assert.deepEqual(state.organizations.map((organization) => organization.name), ['Acme Robotics', 'Zeta']);
  });
});

test('selection keys only use characters SecureStore accepts', () => {
  assert.match(selectionKey('a b/c'), /^[A-Za-z0-9._-]+$/);
});

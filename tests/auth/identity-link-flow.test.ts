import assert from 'node:assert/strict';
import { describe, mock, test } from 'node:test';

import { ApiError, type AccessGrant } from '../../src/api/http-client';
import type { IdentityLinksApi } from '../../src/api/identity-links-api';
import { AuthFlowError } from '../../src/auth/auth-errors';
import type { AuthUser } from '../../src/auth/id-token';
import { describeLinkedIdentity, IdentityLinkFlow, type IdentityLinkState } from '../../src/auth/identity-link-flow';
import type { LinkedIdentity } from '../../src/models/identity-link';
import { EXTERNAL_OBJECT_ID, EXTERNAL_TENANT_ID } from '../support/external-id-fixtures';

const emailUser: AuthUser = {
  provider: 'external-id',
  name: 'Kris E-mail',
  username: 'kris@example.com',
  tenantId: EXTERNAL_TENANT_ID,
  objectId: EXTERNAL_OBJECT_ID,
};

const secondGrant: AccessGrant = { accessToken: 'second-identity-token', isCurrent: () => true };

const identities: LinkedIdentity[] = [
  { provider: 'Entra', isPersonalMicrosoftAccount: true, verifiedEmail: null, createdUtc: 'a', lastUsedUtc: null, isCurrent: true },
  { provider: 'ExternalId', isPersonalMicrosoftAccount: false, verifiedEmail: null, createdUtc: 'b', lastUsedUtc: null, isCurrent: false },
];

function problem(code: string): ApiError {
  return new ApiError('http', code, 409, { code });
}

function setup(overrides: Partial<IdentityLinksApi> = {}, prove?: () => Promise<{ user: AuthUser; grant: AccessGrant }>) {
  const api = {
    start: mock.fn<IdentityLinksApi['start']>(overrides.start ?? (async () => ({ linkId: 'link-1', code: 'secret-code', expiresUtc: 'x' }))),
    claim: mock.fn<IdentityLinksApi['claim']>(
      overrides.claim ?? (async () => ({ linkId: 'link-1', accountDisplayName: 'Kris Account', provider: 'ExternalId', expiresUtc: 'x' })),
    ),
    confirm: mock.fn<IdentityLinksApi['confirm']>(overrides.confirm ?? (async () => identities)),
    cancel: mock.fn<IdentityLinksApi['cancel']>(overrides.cancel ?? (async () => undefined)),
    listIdentities: mock.fn<IdentityLinksApi['listIdentities']>(overrides.listIdentities ?? (async () => identities)),
  };
  const proveIdentity = mock.fn<(provider: string) => Promise<{ user: AuthUser; grant: AccessGrant }>>(
    prove ?? (async () => ({ user: emailUser, grant: secondGrant })),
  );
  const flow = new IdentityLinkFlow({ api, proveIdentity, describeError: () => 'generic error' });
  const states: IdentityLinkState[] = [];
  flow.subscribe((state) => states.push(state));
  return { flow, api, proveIdentity, states };
}

describe('linking a second identity', () => {
  test('start, prove, claim with the second token, and stop for the confirmation', async () => {
    const { flow, api, proveIdentity } = setup();

    await flow.begin('external-id');

    assert.equal(proveIdentity.mock.calls[0].arguments[0], 'external-id');
    assert.deepEqual(api.claim.mock.calls[0].arguments, ['secret-code', secondGrant]);
    assert.deepEqual(flow.getState(), { step: 'confirm', linkId: 'link-1', accountName: 'Kris Account', newIdentity: emailUser });
    // Nothing is linked until the user says yes.
    assert.equal(api.confirm.mock.callCount(), 0);
  });

  test("the user's yes links, and the identities are shown", async () => {
    const { flow, api } = setup();
    await flow.begin('external-id');

    await flow.confirm();

    assert.deepEqual(api.confirm.mock.calls[0].arguments, ['link-1']);
    assert.deepEqual(flow.getState(), { step: 'done', identities });
    assert.equal(api.cancel.mock.callCount(), 0);
  });

  test("the user's no withdraws the request and links nothing", async () => {
    const { flow, api } = setup();
    await flow.begin('external-id');

    await flow.decline();

    assert.deepEqual(api.cancel.mock.calls[0].arguments, ['link-1']);
    assert.equal(api.confirm.mock.callCount(), 0);
    assert.deepEqual(flow.getState(), { step: 'idle', notice: { kind: 'info', message: 'Intet blev tilknyttet.' } });
  });

  test('closing the second sign-in withdraws the request; nothing is claimed', async () => {
    const { flow, api } = setup({}, async () => Promise.reject(new AuthFlowError('cancelled', 'cancelled')));

    await flow.begin('entra');

    assert.equal(api.claim.mock.callCount(), 0);
    assert.deepEqual(api.cancel.mock.calls[0].arguments, ['link-1']);
    const state = flow.getState();
    assert.ok(state.step === 'idle' && state.notice?.kind === 'info');
  });

  test('a sign-in that is a user of its own is explained, not linked', async () => {
    const { flow, api } = setup({ claim: async () => Promise.reject(problem('identity_belongs_to_another_user')) });

    await flow.begin('external-id');

    const state = flow.getState();
    assert.ok(state.step === 'idle' && state.notice?.kind === 'error');
    assert.match(state.notice.message, /lægges aldrig sammen/);
    assert.equal(api.cancel.mock.callCount(), 1);
    assert.equal(api.confirm.mock.callCount(), 0);
  });

  test('an expired request at the confirmation says so', async () => {
    const { flow } = setup({ confirm: async () => Promise.reject(problem('identity_link_invalid')) });
    await flow.begin('external-id');

    await flow.confirm();

    const state = flow.getState();
    assert.ok(state.step === 'idle' && state.notice?.message.includes('udløbet'));
  });

  test('other errors use the general description', async () => {
    const { flow } = setup({ start: async () => Promise.reject(new ApiError('network', 'offline')) });

    await flow.begin('external-id');

    assert.deepEqual(flow.getState(), { step: 'idle', notice: { kind: 'error', message: 'generic error' } });
  });

  test('a second start while one is pending is ignored', async () => {
    const { flow, api } = setup();
    await flow.begin('external-id');

    await flow.begin('entra');

    assert.equal(api.start.mock.callCount(), 1);
    assert.equal(flow.getState().step, 'confirm');
  });

  test('linked identities are described without IDs', () => {
    assert.equal(describeLinkedIdentity(identities[0]), 'Microsoft-konto (personlig) (du er logget ind med denne)');
    assert.equal(describeLinkedIdentity({ ...identities[1], verifiedEmail: 'kris@example.com' }), 'E-mail-kode – kris@example.com');
    assert.equal(
      describeLinkedIdentity({ ...identities[0], isPersonalMicrosoftAccount: false, isCurrent: false }),
      'Microsoft arbejds- eller skolekonto',
    );
  });
});

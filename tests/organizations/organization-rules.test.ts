import '../support/live-mode';

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { ApiError } from '../../src/api/http-client';
import { invitationLink, invitationTokenFromUrl, parseInvitationInput } from '../../src/organizations/invitation-link';
import { describeOrganizationError } from '../../src/organizations/organization-messages';
import { canAdminister, canChangeRoles, canRemoveMember, canRename, invitableRoles } from '../../src/organizations/permissions';
import { readRoomDraft } from '../../src/organizations/room-form';
import { newRandomId } from '../../src/utils/random-id';

const TOKEN = 'Abc_def-0123456789abcdefghijklmnopqrstuvwxy'; // 43 characters, like the API's

describe('what each role is offered', () => {
  test('Owners and Admins administer; Members do not', () => {
    assert.equal(canAdminister('Owner'), true);
    assert.equal(canAdminister('Admin'), true);
    assert.equal(canAdminister('Member'), false);
  });

  test('Owners invite Admins and Members, Admins only Members, Members nobody; never Owner', () => {
    assert.deepEqual(invitableRoles('Owner'), ['Member', 'Admin']);
    assert.deepEqual(invitableRoles('Admin'), ['Member']);
    assert.deepEqual(invitableRoles('Member'), []);
  });

  test('only Owners change roles, so an Admin is never offered making anyone Owner', () => {
    assert.equal(canChangeRoles('Owner'), true);
    assert.equal(canChangeRoles('Admin'), false);
    assert.equal(canChangeRoles('Member'), false);
  });

  test('Owners remove anyone; everyone may leave', () => {
    assert.equal(canRemoveMember('Owner', false), true);
    assert.equal(canRemoveMember('Admin', false), false);
    assert.equal(canRemoveMember('Member', false), false);
    assert.equal(canRemoveMember('Member', true), true);
  });

  test('renaming: Owners only, never the legacy organisation', () => {
    assert.equal(canRename('Owner', false), true);
    assert.equal(canRename('Owner', true), false);
    assert.equal(canRename('Admin', false), false);
  });
});

describe('invitation links', () => {
  test('the link uses the app scheme and round-trips the token', () => {
    const link = invitationLink(TOKEN);
    assert.equal(link, `roombookingdev://invitation?token=${TOKEN}`);
    assert.equal(invitationTokenFromUrl(link), TOKEN);
  });

  test('pasting the token, the link, or a message containing the link', () => {
    assert.equal(parseInvitationInput(`  ${TOKEN}\n`), TOKEN);
    assert.equal(parseInvitationInput(invitationLink(TOKEN)), TOKEN);
    assert.equal(parseInvitationInput(`Åbn linket: ${invitationLink(TOKEN)} på telefonen`), TOKEN);
  });

  test('anything else is not a token', () => {
    assert.equal(parseInvitationInput(''), null);
    assert.equal(parseInvitationInput('hej'), null);
    assert.equal(parseInvitationInput('token with spaces in it, not a code'), null);
    assert.equal(parseInvitationInput('roombookingdev://invitation?token=%E0%A4%A'), null);
  });

  test('only invitation links of this app are handled; the login redirect and other apps are not', () => {
    assert.equal(invitationTokenFromUrl('roombookingdev://auth?code=abc'), null);
    assert.equal(invitationTokenFromUrl(`otherapp://invitation?token=${TOKEN}`), null);
    assert.equal(invitationTokenFromUrl(`https://evil.example/invitation?token=${TOKEN}`), null);
    assert.equal(invitationTokenFromUrl('roombookingdev://invitation'), null);
    assert.equal(invitationTokenFromUrl('not a url'), null);
  });
});

describe('room form', () => {
  test('a valid room is trimmed and its capacity read as a number', () => {
    assert.deepEqual(readRoomDraft({ name: '  Store   sal ', capacity: ' 12 ' }), {
      ok: true,
      room: { name: 'Store sal', capacity: 12 },
    });
  });

  test('the same limits as the API', () => {
    for (const capacity of ['', '0', '-1', '501', '2.5', 'ti']) {
      const result = readRoomDraft({ name: 'Rum', capacity });
      assert.equal(result.ok, false, capacity);
      assert.ok(!result.ok && result.capacityError);
    }
    const noName = readRoomDraft({ name: '   ', capacity: '4' });
    assert.ok(!noName.ok && noName.nameError);
    const longName = readRoomDraft({ name: 'x'.repeat(101), capacity: '4' });
    assert.ok(!longName.ok && longName.nameError);
    assert.equal(readRoomDraft({ name: 'x'.repeat(100), capacity: '500' }).ok, true);
  });
});

describe('error messages', () => {
  const problem = (status: number, code: string) => new ApiError('http', 'x', status, { status, code });

  test('expired invitation, wrong account and missing rights are told apart', () => {
    assert.match(describeOrganizationError(problem(410, 'invitation_expired')), /udløbet/);
    assert.match(describeOrganizationError(problem(403, 'invitation_email_mismatch')), /anden e-mailadresse/);
    assert.match(describeOrganizationError(problem(403, 'organization_permission_denied')), /rolle/);
    assert.match(describeOrganizationError(problem(409, 'last_owner')), /mindst én ejer/);
    assert.match(describeOrganizationError(problem(403, 'booking_permission_denied')), /egne bookinger/);
  });

  test('unknown codes fall back to the general messages', () => {
    assert.match(describeOrganizationError(new ApiError('http', 'x', 500)), /Serverfejl/);
  });
});

test('random IDs are v4 UUIDs and differ', () => {
  const first = newRandomId();
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(first, newRandomId());
});

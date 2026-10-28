import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import type { ServerIdentity } from '../../src/api/current-user';
import type { AuthState } from '../../src/auth/auth-controller';
import { chooseBookingArea, type BookingAreaInput } from '../../src/bookings/booking-area-choice';
import type { CurrentUserResponse } from '../../src/models/current-user';
import type { Organization } from '../../src/models/organization';

// Which booking area the home screen mounts. Mounting one loads the room
// overview at once, so the choice decides which request leaves the app.

const ACME: Organization = { publicId: 'org-acme', name: 'Acme', isLegacy: false, role: 'Member' };
const VERIFIED: CurrentUserResponse = { displayName: 'Kris', username: null, tenantId: 'tenant', user: null };
const REGISTERED: ServerIdentity = {
  status: 'registered',
  identity: VERIFIED,
  user: { publicId: 'user-1', displayName: 'Kris', organizations: [] },
  registeredNow: false,
};

function choose(input: Partial<BookingAreaInput>) {
  return chooseBookingArea({ demo: false, auth: 'signed-in', identity: REGISTERED, active: ACME, ...input });
}

describe('chooseBookingArea', () => {
  test('while a stored session is restored, nothing is mounted, so no token-less request is sent', () => {
    // Phase 5E: a cold start sent an anonymous GET /api/rooms (401) before
    // the app knew the user was signed in.
    assert.deepEqual(choose({ auth: 'restoring', identity: null, active: null }), { kind: 'none' });
  });

  test('without a session, the original endpoints (an API in its anonymous demo mode answers them)', () => {
    const statuses: AuthState['status'][] = ['unavailable', 'signed-out', 'signing-in'];
    for (const auth of statuses) {
      assert.deepEqual(choose({ auth, identity: null, active: null }), { kind: 'original-endpoints' }, auth);
    }
  });

  test('demo mode always shows the demo data, which sends no request', () => {
    const statuses: AuthState['status'][] = ['unavailable', 'restoring', 'signed-out', 'signing-in', 'signed-in'];
    for (const auth of statuses) {
      assert.deepEqual(choose({ demo: true, auth, identity: null, active: null }), { kind: 'original-endpoints' }, auth);
    }
  });

  test('a registered user works in the active organisation', () => {
    assert.deepEqual(choose({}), { kind: 'organization', organization: ACME });
  });

  test('a registered user without an organisation (onboarding, or the list still loading) gets none', () => {
    assert.deepEqual(choose({ active: null }), { kind: 'none' });
  });

  test('while the API confirms or registers the user, nothing is mounted', () => {
    assert.deepEqual(choose({ identity: null, active: null }), { kind: 'none' });
    assert.deepEqual(choose({ identity: { status: 'checking' }, active: null }), { kind: 'none' });
    assert.deepEqual(choose({ identity: { status: 'registering', identity: VERIFIED }, active: null }), { kind: 'none' });
  });

  test('an API without organisations, or one the token is not sent to, uses the original endpoints', () => {
    const identities: ServerIdentity[] = [
      { status: 'unsupported' },
      { status: 'not-configured' },
      { status: 'registration-unsupported', identity: VERIFIED },
      { status: 'insecure-transport' },
    ];
    for (const identity of identities) {
      assert.deepEqual(choose({ identity, active: null }), { kind: 'original-endpoints' }, identity.status);
    }
  });

  test('when the API refused the user or could not be asked, nothing is mounted: the account panel says why', () => {
    // The original endpoints serve the legacy organisation only: a disabled
    // or unregistered user gets the same refusal there a second time, and an
    // offline check the same offline message. After a transient failure the
    // user must not end up in the legacy organisation without choosing it.
    const identities: ServerIdentity[] = [
      { status: 'rejected', message: 'Din Room Booking-konto er deaktiveret.' },
      { status: 'error', message: 'Kunne ikke få forbindelse til Microsoft.' },
      { status: 'registration-failed', identity: VERIFIED, message: 'Serverfejl (500). Prøv igen om lidt.' },
    ];
    for (const identity of identities) {
      assert.deepEqual(choose({ identity, active: null }), { kind: 'none' }, identity.status);
    }
  });
});

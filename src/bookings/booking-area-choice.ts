import type { ServerIdentity } from '../api/current-user';
import type { AuthState } from '../auth/auth-controller';
import type { Organization } from '../models/organization';

/** Which booking area the home screen shows, and so which API it talks to. */
export type BookingAreaChoice =
  /** None yet, or none at all: nothing is requested. */
  | { kind: 'none' }
  /** Demo data, or the original /api/rooms and /api/bookings endpoints. */
  | { kind: 'original-endpoints' }
  /** The rooms and bookings of the user's active organisation. */
  | { kind: 'organization'; organization: Organization };

export interface BookingAreaInput {
  demo: boolean;
  auth: AuthState['status'];
  /** What the API says about the signed-in user (see useServerIdentity). */
  identity: ServerIdentity | null;
  /** The active organisation, once the organisation list is ready. */
  active: Organization | null;
}

/**
 * Decides the home screen's booking area. A booking area loads the room
 * overview as soon as it is mounted, so this also decides which request
 * leaves the app first. Pure, so the rule runs in the Node tests;
 * HomeScreen only renders the choice.
 */
export function chooseBookingArea({ demo, auth, identity, active }: BookingAreaInput): BookingAreaChoice {
  // Demo data sends no request.
  if (demo) return { kind: 'original-endpoints' };
  // Not known yet whether a stored session exists: a request now would go
  // out without its token and be answered 401.
  if (auth === 'restoring') return { kind: 'none' };
  // Without a session: the original endpoints, which a real API answers
  // with 401 unless it runs in its anonymous demo mode.
  if (auth !== 'signed-in') return { kind: 'original-endpoints' };

  switch (identity?.status) {
    case 'registered':
      return active ? { kind: 'organization', organization: active } : { kind: 'none' };
    // An API without registration or organisations, or one the token is not
    // sent to: the original endpoints.
    case 'unsupported':
    case 'not-configured':
    case 'registration-unsupported':
    case 'insecure-transport':
      return { kind: 'original-endpoints' };
    // Still checking, or the API refused the user or could not be asked (the
    // account panel says why and offers "Prøv igen"). The original endpoints
    // serve the legacy organisation only and would repeat the refusal, or put
    // the user in that organisation without their choosing it.
    default:
      return { kind: 'none' };
  }
}

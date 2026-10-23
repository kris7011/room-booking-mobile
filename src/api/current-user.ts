import type {
  CurrentUserResponse,
  MembershipRole,
  OrganizationMembership,
  RegisteredUser,
  RegistrationResponse,
} from '../models/current-user';
import { ApiError, requestJson } from './http-client';

/** GET /api/me: the identity the API derives from the access token. Read-only. Needs a signed-in user. */
export function fetchCurrentUser(): Promise<CurrentUserResponse> {
  return requestJson<CurrentUserResponse>('/api/me');
}

/**
 * POST /api/me/registration: makes the signed-in identity a Room Booking
 * user. Idempotent: the API returns the existing user if there is one, so a
 * repeated or concurrent call never creates a second user. No body: the API
 * takes the identity from the access token alone.
 */
export function registerCurrentUser(): Promise<RegistrationResponse> {
  return requestJson<RegistrationResponse>('/api/me/registration', { method: 'POST' });
}

/** What the account panel says about the API's view of the signed-in user. */
export type ServerIdentity =
  | { status: 'checking' }
  /** Verified by the API, not registered yet; registration is under way. */
  | { status: 'registering'; identity: CurrentUserResponse }
  /** Verified and registered. registeredNow: this check created the user. */
  | { status: 'registered'; identity: CurrentUserResponse; user: RegisteredUser; registeredNow: boolean }
  /** Verified, but the API has no registration endpoint (an older API version). */
  | { status: 'registration-unsupported'; identity: CurrentUserResponse }
  /** Verified, but registration failed (network, server error); can be retried. */
  | { status: 'registration-failed'; identity: CurrentUserResponse; message: string }
  /** The API has no /api/me yet (an API version without login). */
  | { status: 'unsupported' }
  /** The API runs without Entra settings. */
  | { status: 'not-configured' }
  /** The API address is not one a token may be sent to (see canSendBearerToken). */
  | { status: 'insecure-transport' }
  /** The API rejected the token (401) or the user (403, e.g. a disabled account). */
  | { status: 'rejected'; message: string }
  | { status: 'error'; message: string };

export interface CurrentUserApi {
  fetchCurrentUser(): Promise<CurrentUserResponse>;
  registerCurrentUser(): Promise<RegistrationResponse>;
}

export const currentUserApi: CurrentUserApi = { fetchCurrentUser, registerCurrentUser };

/**
 * The account panel's check after login: asks the API who the user is
 * (GET, read-only) and registers them only if the API has no user for this
 * identity yet. A returning user costs one GET and writes nothing.
 */
export async function verifyAndRegister(
  api: CurrentUserApi,
  describe: (error: unknown) => string,
  onRegistering?: (identity: CurrentUserResponse) => void,
): Promise<ServerIdentity> {
  let identity: CurrentUserResponse;
  try {
    identity = await api.fetchCurrentUser();
  } catch (error) {
    return classifyCurrentUserError(error, describe);
  }

  if (identity.user) {
    return { status: 'registered', identity, user: identity.user, registeredNow: false };
  }

  onRegistering?.(identity);
  try {
    const result = await api.registerCurrentUser();
    const registered = result.currentUser;
    if (!registered.user) {
      return { status: 'registration-failed', identity, message: "API'et svarede uden en bruger. Prøv igen." };
    }
    return { status: 'registered', identity: registered, user: registered.user, registeredNow: result.created };
  } catch (error) {
    // An API with /api/me but without registration answers 404 or 405
    // without a problem code.
    if (
      error instanceof ApiError &&
      error.kind === 'http' &&
      (error.status === 404 || error.status === 405) &&
      error.problem?.code === undefined
    ) {
      return { status: 'registration-unsupported', identity };
    }
    const classified = classifyCurrentUserError(error, describe);
    if (classified.status === 'rejected') return classified;
    return { status: 'registration-failed', identity, message: describe(error) };
  }
}

/** Sorts a failed /api/me call into the cases the UI tells apart. */
export function classifyCurrentUserError(error: unknown, describe: (error: unknown) => string): ServerIdentity {
  if (error instanceof ApiError && error.kind === 'http') {
    if (error.status === 404 && error.problem?.code === undefined) return { status: 'unsupported' };
    if (error.status === 503 && error.problem?.code === 'authentication_not_configured') {
      return { status: 'not-configured' };
    }
    if (error.status === 401) {
      return { status: 'rejected', message: "API'et afviste login-tokenet. Log ud og ind igen." };
    }
    if (error.status === 403 && error.problem?.code === 'user_disabled') {
      return {
        status: 'rejected',
        message: 'Din Room Booking-konto er deaktiveret. Kontakt en administrator, hvis det er en fejl.',
      };
    }
    if (error.status === 403) {
      return { status: 'rejected', message: error.problem?.detail ?? "Din konto har ikke adgang til API'et." };
    }
  }
  return { status: 'error', message: describe(error) };
}

const ROLE_NAMES: Record<MembershipRole, string> = {
  Owner: 'Ejer',
  Admin: 'Administrator',
  Member: 'Medlem',
};

/** "Ejer", "Administrator" or "Medlem"; an unknown role from a newer API is shown as is. */
export function describeRole(role: MembershipRole | string): string {
  return ROLE_NAMES[role as MembershipRole] ?? role;
}

/** One line per organisation, e.g. "Legacy (standardorganisation) · Ejer". */
export function describeMembership(membership: OrganizationMembership): string {
  const name = membership.isLegacy ? `${membership.name} (standardorganisation)` : membership.name;
  return `${name} · ${describeRole(membership.role)}`;
}

/** What a registered user is told about their organisation access. */
export function describeOrganizationAccess(user: RegisteredUser): { title: string; detail: string } {
  if (user.organizations.length === 0) {
    return {
      title: 'Du er ikke medlem af en organisation endnu',
      detail:
        'Du får adgang, når en ejer eller administrator inviterer dig. Den første ejer af standardorganisationen ' +
        "udpeges af den, der driver API'et, ud fra dit bruger-ID herunder. Indtil da kan du søge og booke som før.",
    };
  }
  const count = user.organizations.length;
  return {
    title: count === 1 ? 'Din organisation' : `Dine ${count} organisationer`,
    detail: user.organizations.map(describeMembership).join('\n'),
  };
}

// Everything that can go wrong while signing in, refreshing or storing a
// session, as one error type with a kind the UI can act on. Messages never
// contain tokens, codes or code verifiers: only Entra's error code and its
// AADSTS number, which are safe to show and help when asking for support.

export type AuthErrorKind =
  /** The user closed the browser. Not shown as an error. */
  | 'cancelled'
  /** The user or an administrator refused access. */
  | 'access-denied'
  /** Permission to the API has not been granted (user or admin consent). */
  | 'consent-required'
  /** The app registration or app settings do not match. Needs a developer. */
  | 'configuration'
  /** The response did not belong to the request this app started (CSRF protection). */
  | 'state-mismatch'
  /** The refresh token is expired, revoked or needs a new interactive login. */
  | 'session-expired'
  | 'network'
  | 'timeout'
  /** Entra answered with something the app cannot use. */
  | 'invalid-response'
  /** Microsoft's side failed or is unavailable. */
  | 'server'
  /** SecureStore could not read or write. */
  | 'storage'
  /** Another login is still open. */
  | 'busy'
  | 'unknown';

export class AuthFlowError extends Error {
  constructor(
    readonly kind: AuthErrorKind,
    message: string,
    /** The OAuth error code, e.g. invalid_grant. */
    readonly oauthError?: string,
    /** e.g. AADSTS50011, taken from Entra's error description. */
    readonly aadsts?: string,
  ) {
    super(message);
    this.name = 'AuthFlowError';
  }
}

// AADSTS codes that need their own explanation. Everything else falls back
// to the OAuth error code.
const AADSTS_KINDS: Record<string, AuthErrorKind> = {
  // Redirect URI not registered for the app.
  AADSTS50011: 'configuration',
  // Application not found in the directory.
  AADSTS700016: 'configuration',
  // Redirect URI registered as "Web" instead of "Mobile and desktop
  // applications", so Entra wants a client secret the app must not have.
  AADSTS7000218: 'configuration',
  // Resource (API) not found in the tenant, or scope unknown.
  AADSTS500011: 'consent-required',
  AADSTS70011: 'configuration',
  AADSTS650053: 'configuration',
  // Consent needed: by the user, or by an administrator.
  AADSTS65001: 'consent-required',
  AADSTS90094: 'consent-required',
  AADSTS90008: 'consent-required',
  // User declined consent, or the account may not use the app.
  AADSTS65004: 'access-denied',
  AADSTS50020: 'access-denied',
  AADSTS50105: 'access-denied',
  AADSTS53003: 'access-denied',
  // Refresh token expired, revoked or invalidated (password change, sign
  // out everywhere, inactivity, Conditional Access needing a new sign-in).
  AADSTS700082: 'session-expired',
  AADSTS70008: 'session-expired',
  AADSTS50173: 'session-expired',
  AADSTS700084: 'session-expired',
  AADSTS50133: 'session-expired',
  AADSTS50076: 'session-expired',
  AADSTS50079: 'session-expired',
  AADSTS54005: 'invalid-response',
};

const OAUTH_ERROR_KINDS: Record<string, AuthErrorKind> = {
  access_denied: 'access-denied',
  consent_required: 'consent-required',
  invalid_grant: 'session-expired',
  interaction_required: 'session-expired',
  login_required: 'session-expired',
  invalid_client: 'configuration',
  unauthorized_client: 'configuration',
  invalid_request: 'configuration',
  invalid_scope: 'configuration',
  unsupported_response_type: 'configuration',
  state_mismatch: 'state-mismatch',
  server_error: 'server',
  temporarily_unavailable: 'server',
};

/** Picks the AADSTS number out of an Entra error description. */
export function findAadstsCode(description: string | undefined): string | undefined {
  return /\bAADSTS\d+\b/.exec(description ?? '')?.[0];
}

/**
 * An OAuth error from the authorize redirect or the token endpoint. The
 * description is only used to find the AADSTS code; it is not kept, since
 * it may contain trace and correlation IDs that do not belong in the UI.
 */
export function oauthError(error: string, description?: string): AuthFlowError {
  const aadsts = findAadstsCode(description);
  // For the token endpoint, invalid_grant can also mean a code that was
  // already used or a redirect URI mismatch; the specific code decides.
  const kind = (aadsts && AADSTS_KINDS[aadsts]) || OAUTH_ERROR_KINDS[error] || 'unknown';
  return new AuthFlowError(kind, `${error}${aadsts ? ` (${aadsts})` : ''}`, error, aadsts);
}

export function isAuthFlowError(error: unknown, kind?: AuthErrorKind): error is AuthFlowError {
  return error instanceof AuthFlowError && (kind === undefined || error.kind === kind);
}

/** A message a user can act on, in Danish like the rest of the app. */
export function describeAuthError(error: unknown): string {
  if (!(error instanceof AuthFlowError)) return 'Login mislykkedes på grund af en uventet fejl. Prøv igen.';

  const code = error.aadsts ? ` (${error.aadsts})` : error.oauthError ? ` (${error.oauthError})` : '';
  switch (error.kind) {
    case 'cancelled':
      return 'Login blev annulleret.';
    case 'access-denied':
      return `Microsoft afviste login. Din konto har muligvis ikke adgang til Room Booking${code}.`;
    case 'consent-required':
      return (
        `Appen har ikke fået tilladelse til at bruge Room Booking-API'et${code}. ` +
        'En administrator i din organisation skal muligvis give samtykke.'
      );
    case 'configuration':
      return (
        `Microsoft-login er ikke sat korrekt op${code}. ` +
        'Tjek appregistreringen i Microsoft Entra (se README).'
      );
    case 'state-mismatch':
      return 'Svaret fra Microsoft hørte ikke til dette login og blev afvist. Prøv igen.';
    case 'session-expired':
      return 'Din Microsoft-session er udløbet. Log ind igen.';
    case 'network':
      return 'Kunne ikke få forbindelse til Microsoft. Tjek internetforbindelsen og prøv igen.';
    case 'timeout':
      return 'Microsoft svarede ikke i tide. Prøv igen.';
    case 'invalid-response':
      return `Microsoft returnerede et svar, appen ikke kunne bruge${code}. Prøv igen.`;
    case 'server':
      return `Microsoft-login er midlertidigt utilgængeligt${code}. Prøv igen om lidt.`;
    case 'storage':
      return 'Login-sessionen kunne ikke læses eller gemmes sikkert på enheden.';
    case 'busy':
      return 'Et login er allerede i gang.';
    case 'unknown':
      return `Login mislykkedes${code}. Prøv igen.`;
  }
}

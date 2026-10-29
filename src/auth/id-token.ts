// Reads who signed in from the ID token, for display only.
//
// The app does not verify the token's signature: it received the token
// directly from Entra's token endpoint over TLS, which OpenID Connect Core
// (section 3.1.3.7) accepts in place of a signature check. The claims below
// are still checked so that a token for another app or tenant is never
// shown as the user. None of this decides access: the API validates the
// access token itself (signature, issuer, audience, scope) and is the only
// party that decides who the user is (see GET /api/me).
import { AuthFlowError } from './auth-errors';
import { expectedIssuer, isGuid } from './entra-config';

/** Tolerated difference between the phone's clock and Entra's. */
const CLOCK_SKEW_MS = 5 * 60 * 1000;

/**
 * Which sign-in the user chose: a Microsoft account through Entra ID, or an
 * e-mail address and a one-time code through Entra External ID.
 */
export type AuthProviderId = 'entra' | 'external-id';

export const AUTH_PROVIDER_IDS: readonly AuthProviderId[] = ['entra', 'external-id'];

/** What the app shows about the signed-in user. Not a credential. */
export interface AuthUser {
  /** Where the session came from, so it is renewed by the same issuer. */
  provider: AuthProviderId;
  /** The `name` claim, e.g. "Kris Larsen". */
  name: string;
  /**
   * The `preferred_username` claim, usually an e-mail address. Mutable, and a
   * personal and a work account can share it: display only, never a key.
   */
  username: string | null;
  /** Tenant (`tid`) and object ID (`oid`): the user's stable identity, with the provider. */
  tenantId: string;
  objectId: string;
}

export interface IdTokenExpectations {
  clientId: string;
  /** Set when the app is limited to one tenant. */
  requiredTenantId: string | null;
  nowMs: number;
}

/** The decoded payload of a JWT, without checking anything. Null when malformed. */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const payload: unknown = JSON.parse(decodeBase64UrlUtf8(parts[1]));
    return typeof payload === 'object' && payload !== null && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Base64url → UTF-8 text, without TextDecoder (not guaranteed on Hermes). */
export function decodeBase64UrlUtf8(input: string): string {
  if (!/^[A-Za-z0-9_-]*$/.test(input)) throw new Error('Not base64url');
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  // Each byte as %XX, so decodeURIComponent reassembles multi-byte characters (æ, ø, å).
  let percentEncoded = '';
  for (let index = 0; index < binary.length; index++) {
    percentEncoded += `%${binary.charCodeAt(index).toString(16).padStart(2, '0')}`;
  }
  return decodeURIComponent(percentEncoded);
}

export interface ExternalIdTokenExpectations {
  clientId: string;
  /** The external tenant: its tokens must carry it as `tid`. */
  tenantId: string;
  /** The tenant's exact `iss` (see ExternalIdConfig.issuer). */
  issuer: string;
  nowMs: number;
}

const invalid = (reason: string) => new AuthFlowError('invalid-response', `ID token: ${reason}`);

/** Checks a Microsoft (Entra ID) ID token's claims and returns the user to show. Throws AuthFlowError('invalid-response'). */
export function readIdTokenUser(idToken: string | undefined, expected: IdTokenExpectations): AuthUser {
  const claims = readClaims(idToken, expected.clientId);

  const tenantId = claims.tid;
  if (!isGuid(tenantId)) throw invalid('no tenant');
  if (claims.iss !== expectedIssuer(tenantId)) throw invalid('unexpected issuer');
  if (expected.requiredTenantId && tenantId.toLowerCase() !== expected.requiredTenantId) {
    throw invalid('another tenant');
  }
  checkLifetime(claims, expected.nowMs);

  return toUser('entra', claims, tenantId, 'Microsoft-bruger');
}

/**
 * Checks an External ID ID token's claims: this app, the one external
 * tenant, and that tenant's exact issuer. Throws AuthFlowError('invalid-response').
 */
export function readExternalIdTokenUser(idToken: string | undefined, expected: ExternalIdTokenExpectations): AuthUser {
  const claims = readClaims(idToken, expected.clientId);

  const tenantId = claims.tid;
  if (!isGuid(tenantId) || tenantId.toLowerCase() !== expected.tenantId.toLowerCase()) throw invalid('another tenant');
  if (claims.iss !== expected.issuer) throw invalid('unexpected issuer');
  checkLifetime(claims, expected.nowMs);

  return toUser('external-id', claims, tenantId, 'E-mail-bruger');
}

/** Decodes the token and checks that it was issued to this app. */
function readClaims(idToken: string | undefined, clientId: string): Record<string, unknown> {
  if (!idToken) throw invalid('missing');

  const claims = decodeJwtPayload(idToken);
  if (!claims) throw invalid('malformed');

  const audience = claims.aud;
  const audiences = Array.isArray(audience) ? audience : [audience];
  if (!audiences.includes(clientId)) throw invalid('issued to another app');
  return claims;
}

function checkLifetime(claims: Record<string, unknown>, nowMs: number): void {
  if (typeof claims.exp !== 'number' || claims.exp * 1000 + CLOCK_SKEW_MS < nowMs) {
    throw invalid('expired');
  }
}

function toUser(provider: AuthProviderId, claims: Record<string, unknown>, tenantId: string, fallbackName: string): AuthUser {
  const objectId = claims.oid;
  if (!isGuid(objectId)) throw invalid('no object ID');

  // External ID may send no preferred_username; its e-mail is display only, too.
  const username = text(claims.preferred_username) || (provider === 'external-id' ? text(claims.email) : '');
  const name = text(claims.name);
  return {
    provider,
    name: name || username || fallbackName,
    username: username || null,
    tenantId: tenantId.toLowerCase(),
    objectId: objectId.toLowerCase(),
  };
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

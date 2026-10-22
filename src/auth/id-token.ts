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

/** What the app shows about the signed-in user. Not a credential. */
export interface AuthUser {
  /** The `name` claim, e.g. "Kris Larsen". */
  name: string;
  /**
   * The `preferred_username` claim, usually an e-mail address. Mutable, and a
   * personal and a work account can share it: display only, never a key.
   */
  username: string | null;
  /** Entra tenant (`tid`) and object ID (`oid`): the user's stable identity. */
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

/** Checks the ID token's claims and returns the user to show. Throws AuthFlowError('invalid-response'). */
export function readIdTokenUser(idToken: string | undefined, expected: IdTokenExpectations): AuthUser {
  const invalid = (reason: string) => new AuthFlowError('invalid-response', `ID token: ${reason}`);
  if (!idToken) throw invalid('missing');

  const claims = decodeJwtPayload(idToken);
  if (!claims) throw invalid('malformed');

  const audience = claims.aud;
  const audiences = Array.isArray(audience) ? audience : [audience];
  if (!audiences.includes(expected.clientId)) throw invalid('issued to another app');

  const tenantId = claims.tid;
  if (!isGuid(tenantId)) throw invalid('no tenant');
  if (claims.iss !== expectedIssuer(tenantId)) throw invalid('unexpected issuer');
  if (expected.requiredTenantId && tenantId.toLowerCase() !== expected.requiredTenantId) {
    throw invalid('another tenant');
  }

  if (typeof claims.exp !== 'number' || claims.exp * 1000 + CLOCK_SKEW_MS < expected.nowMs) {
    throw invalid('expired');
  }

  const objectId = claims.oid;
  if (!isGuid(objectId)) throw invalid('no object ID');

  const username = typeof claims.preferred_username === 'string' ? claims.preferred_username.trim() : '';
  const name = typeof claims.name === 'string' ? claims.name.trim() : '';
  return {
    name: name || username || 'Microsoft-bruger',
    username: username || null,
    tenantId: tenantId.toLowerCase(),
    objectId: objectId.toLowerCase(),
  };
}

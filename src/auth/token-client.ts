// Talks to Entra's token endpoint: redeems the authorization code (with the
// PKCE code verifier) and refreshes tokens. A public client, so no client
// secret is ever sent; PKCE proves that the app that started the login is
// the one redeeming the code.
//
// expo-auth-session has exchangeCodeAsync/refreshAsync, but they have no
// timeout and turn a network failure into a bare TypeError. This module
// does the same two POSTs with plain fetch, so every failure becomes an
// AuthFlowError and can be tested without a phone.
import { AuthFlowError, oauthError } from './auth-errors';

const TOKEN_REQUEST_TIMEOUT_MS = 15_000;

export interface TokenClientConfig {
  clientId: string;
  tokenEndpoint: string;
  redirectUri: string;
  scopes: readonly string[];
  /** Checked against the granted scopes, so a token without API access is caught here. */
  apiScope: string;
}

/** Tokens from one successful token response. Kept in memory; only the refresh token is stored. */
export interface TokenSet {
  accessToken: string;
  /** Absolute expiry of the access token, in ms since the epoch. */
  accessTokenExpiresAt: number;
  /** Entra rotates it on every refresh; absent if offline_access was not granted. */
  refreshToken?: string;
  idToken?: string;
}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export interface TokenClientDeps {
  fetch?: FetchLike;
  now?: () => number;
  timeoutMs?: number;
}

export function redeemAuthorizationCode(
  config: TokenClientConfig,
  grant: { code: string; codeVerifier: string },
  deps: TokenClientDeps = {},
): Promise<TokenSet> {
  return requestTokens(
    config,
    {
      grant_type: 'authorization_code',
      client_id: config.clientId,
      code: grant.code,
      code_verifier: grant.codeVerifier,
      redirect_uri: config.redirectUri,
      scope: config.scopes.join(' '),
    },
    deps,
  );
}

export function redeemRefreshToken(
  config: TokenClientConfig,
  refreshToken: string,
  deps: TokenClientDeps = {},
): Promise<TokenSet> {
  return requestTokens(
    config,
    {
      grant_type: 'refresh_token',
      client_id: config.clientId,
      refresh_token: refreshToken,
      redirect_uri: config.redirectUri,
      scope: config.scopes.join(' '),
    },
    deps,
  );
}

async function requestTokens(
  config: TokenClientConfig,
  form: Record<string, string>,
  { fetch: fetchFn = fetch, now = Date.now, timeoutMs = TOKEN_REQUEST_TIMEOUT_MS }: TokenClientDeps,
): Promise<TokenSet> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const sentAt = now();

  let response: Response;
  let payload: unknown;
  try {
    response = await fetchFn(config.tokenEndpoint, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
      signal: controller.signal,
    });
    payload = await response.json().catch(() => undefined);
  } catch {
    // The error itself is not kept: its text could include request details.
    if (controller.signal.aborted) throw new AuthFlowError('timeout', 'Token request timed out');
    throw new AuthFlowError('network', 'Token endpoint unreachable');
  } finally {
    clearTimeout(timeout);
  }

  const body = (typeof payload === 'object' && payload !== null ? payload : {}) as Record<string, unknown>;

  if (!response.ok || typeof body.error === 'string') {
    if (typeof body.error === 'string') {
      throw oauthError(body.error, typeof body.error_description === 'string' ? body.error_description : undefined);
    }
    throw new AuthFlowError(response.status >= 500 ? 'server' : 'invalid-response', `Token endpoint HTTP ${response.status}`);
  }

  return parseTokenResponse(body, config.apiScope, sentAt);
}

/** Validates a successful token response. Exported for tests. */
export function parseTokenResponse(body: Record<string, unknown>, apiScope: string, sentAt: number): TokenSet {
  const invalid = (reason: string) => new AuthFlowError('invalid-response', `Token response: ${reason}`);

  if (typeof body.access_token !== 'string' || !body.access_token) throw invalid('no access token');
  if (typeof body.token_type !== 'string' || body.token_type.toLowerCase() !== 'bearer') throw invalid('not a bearer token');

  // Entra sends a number; tolerate a numeric string.
  const expiresIn = typeof body.expires_in === 'string' ? Number(body.expires_in) : body.expires_in;
  if (typeof expiresIn !== 'number' || !Number.isFinite(expiresIn) || expiresIn <= 0) throw invalid('no lifetime');

  // Without the API scope the token is useless for the API, typically
  // because consent was given for openid/profile only. Entra may list the
  // scope with or without its api://… prefix; the API checks `scp` anyway.
  if (typeof body.scope === 'string') {
    const granted = body.scope.toLowerCase().split(/\s+/);
    const fullScope = apiScope.toLowerCase();
    const scopeName = fullScope.slice(fullScope.lastIndexOf('/') + 1);
    if (!granted.includes(fullScope) && !granted.includes(scopeName)) {
      throw new AuthFlowError('consent-required', 'API scope not granted');
    }
  }

  return {
    accessToken: body.access_token,
    // Measured from when the request was sent, so time spent on the network
    // makes the token look older, never younger.
    accessTokenExpiresAt: sentAt + expiresIn * 1000,
    refreshToken: typeof body.refresh_token === 'string' && body.refresh_token ? body.refresh_token : undefined,
    idToken: typeof body.id_token === 'string' && body.id_token ? body.id_token : undefined,
  };
}

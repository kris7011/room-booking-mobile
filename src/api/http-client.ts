import { AuthFlowError } from '../auth/auth-errors';
import { isDevelopmentBundle } from '../config/build';
import { apiBaseUrl } from '../config/env';
import type { ProblemDetails } from '../models/problem-details';

const REQUEST_TIMEOUT_MS = 10_000;

export type ApiErrorKind = 'network' | 'timeout' | 'http' | 'invalid-response' | 'not-configured' | 'auth';

// One error type for everything that can go wrong in a request, so screens
// only need a single catch branch.
export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    message: string,
    readonly status?: number,
    readonly problem?: ProblemDetails,
    /** For 'auth': the AuthFlowError from renewing the access token. */
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** An access token together with a check that its session is still the current one. */
export interface AccessGrant {
  accessToken: string;
  /** False once the user has signed out (or out and in again) since the grant was made. */
  isCurrent(): boolean;
}

/**
 * Where requests get their access token: the AuthController while the app
 * runs, a fake in tests, nothing when login is unavailable. null means
 * "nobody is signed in": the request is sent without Authorization, as
 * without login. A rejection means the request must not be sent at all.
 */
export interface AccessTokenProvider {
  getAccessGrant(options?: { forceRefresh?: boolean }): Promise<AccessGrant | null>;
}

let accessTokenProvider: AccessTokenProvider | null = null;

/** Registers (or with null removes) the single source of access tokens for every API request. */
export function setAccessTokenProvider(provider: AccessTokenProvider | null): void {
  accessTokenProvider = provider;
}

/**
 * Problem codes that mean the caller's membership, role or account changed
 * since the app last asked: removed (or the organisation is gone), demoted,
 * disabled, or no longer registered.
 */
export const ACCESS_CHANGED_CODES: ReadonlySet<string> = new Set([
  'organization_not_found',
  'organization_permission_denied',
  'user_disabled',
  'user_not_registered',
]);

let accessChangedListener: ((code: string) => void) | null = null;

/**
 * Registers (or with null removes) who is told when an answer has one of
 * ACCESS_CHANGED_CODES, so the organisation list can be brought up to date
 * from wherever the request was made. Told before the request rejects.
 */
export function setAccessChangedListener(listener: ((code: string) => void) | null): void {
  accessChangedListener = listener;
}

/**
 * Where a bearer token may be sent:
 *
 * - Release bundle: only over HTTPS.
 * - Development bundle: also over HTTP to the device itself (localhost,
 *   127.0.0.0/8, ::1) and to 10.0.2.2, the Android emulator's alias for the
 *   host PC. Neither leaves the device or the PC: on a physical phone,
 *   `adb reverse tcp:5003 tcp:5003` carries localhost:5003 over the USB
 *   cable to the PC's localhost (see docs/device-testing.md, "Sign-in against
 *   a local API over USB").
 *
 * Never over plain HTTP to any other address, not even a private Wi-Fi
 * address: anyone on that network could read and replay the token.
 */
export function canSendBearerToken(url: string, { development }: { development: boolean }): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol === 'https:') return true;
  if (parsed.protocol !== 'http:' || !development) return false;

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return host === 'localhost' || host === '::1' || host === '10.0.2.2' || /^127(\.\d{1,3}){3}$/.test(host);
}

/** Whether requests to the configured API can carry the signed-in user's token. */
export function canSendBearerTokenToApi(): boolean {
  return apiBaseUrl !== null && canSendBearerToken(`${apiBaseUrl}/`, { development: isDevelopmentBundle() });
}

type QueryValue = string | number | undefined;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  query?: Record<string, QueryValue>;
  body?: unknown;
  /** Extra request headers, e.g. Idempotency-Key. Never Authorization: that comes from the token provider. */
  headers?: Record<string, string>;
}

export function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  if (!apiBaseUrl) {
    throw new ApiError('not-configured', 'EXPO_PUBLIC_API_URL is not set.');
  }

  const params = Object.entries(query ?? {})
    .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');

  return `${apiBaseUrl}${path}${params ? `?${params}` : ''}`;
}

export async function requestJson<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = buildUrl(path, options.query);
  // Over an insecure connection the token is not even requested: the request
  // goes out exactly as without login.
  const provider = canSendBearerToken(url, { development: isDevelopmentBundle() }) ? accessTokenProvider : null;

  // A request that starts signed in stays that user's request: it is sent
  // with that user's token or not at all, never anonymously or as another
  // user who signed in while it waited.
  const grant = provider ? await getAccessGrant(provider, false) : null;
  let response = await send(url, options, grant);

  // A 401 for a token the app thought was valid (revoked, or the clocks
  // disagree): renew it once and repeat the request. Safe for a POST too,
  // because the API rejects the token before the endpoint runs.
  //
  // The retry belongs to the same session as the first attempt. A fresh
  // grant would bind to whoever is signed in by now, so the original grant
  // is checked before renewing (no renewal for a session that has ended)
  // and again afterwards (the renewed token is still that session's).
  if (response.status === 401 && provider && grant) {
    assertStillCurrent(grant);
    const renewed = await getAccessGrant(provider, true);
    assertStillCurrent(grant);
    if (!renewed) throw sessionChangedError();
    response = await send(url, options, renewed);
  }

  return readResponse<T>(url, response);
}

function sessionChangedError(): ApiError {
  const cause = new AuthFlowError('session-changed', 'Session ended before sending');
  return new ApiError('auth', 'The session ended before the request was sent.', undefined, undefined, cause);
}

function assertStillCurrent(grant: AccessGrant): void {
  if (!grant.isCurrent()) throw sessionChangedError();
}

async function getAccessGrant(provider: AccessTokenProvider, forceRefresh: boolean): Promise<AccessGrant | null> {
  try {
    return await provider.getAccessGrant(forceRefresh ? { forceRefresh } : undefined);
  } catch (error) {
    // Never includes the token; the AuthFlowError in `cause` says why.
    throw new ApiError('auth', 'Could not get an access token.', undefined, undefined, error);
  }
}

async function send(url: string, options: RequestOptions, grant: AccessGrant | null): Promise<Response> {
  // Checked synchronously right before fetch, so nothing can end the session
  // between this check and the request leaving with its token.
  if (grant) assertStillCurrent(grant);
  const accessToken = grant?.accessToken ?? null;

  // fetch has no built-in timeout; abort it ourselves so a phone that cannot
  // reach the PC shows an error instead of spinning forever.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      method: options.method ?? 'GET',
      headers: {
        ...options.headers,
        Accept: 'application/json',
        ...(options.body !== undefined && { 'Content-Type': 'application/json' }),
        ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ApiError('timeout', `Request to ${url} timed out.`);
    }
    // fetch rejects (TypeError) on DNS/connection failures and, in browsers,
    // when CORS blocks the response. The HTTP status is never visible then.
    throw new ApiError('network', `Could not reach ${url}: ${String(error)}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function readResponse<T>(url: string, response: Response): Promise<T> {
  const text = await response.text();
  let payload: unknown = undefined;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      if (response.ok) {
        throw new ApiError('invalid-response', `Response from ${url} was not valid JSON.`, response.status);
      }
    }
  }

  if (!response.ok) {
    const problem = isProblemDetails(payload) ? payload : undefined;
    if (problem?.code && ACCESS_CHANGED_CODES.has(problem.code)) notifyAccessChanged(problem.code);
    throw new ApiError(
      'http',
      problem?.detail ?? problem?.title ?? `HTTP ${response.status} from ${url}`,
      response.status,
      problem,
    );
  }

  return payload as T;
}

function notifyAccessChanged(code: string): void {
  try {
    accessChangedListener?.(code);
  } catch {
    // A listener's failure must not replace the request's own error.
  }
}

function isProblemDetails(value: unknown): value is ProblemDetails {
  return typeof value === 'object' && value !== null && ('title' in value || 'status' in value);
}

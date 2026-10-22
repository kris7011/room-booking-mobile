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

/**
 * Where requests get their access token: the AuthController while the app
 * runs, a fake in tests, nothing when login is unavailable. null means
 * "nobody is signed in": the request is sent without Authorization.
 */
export interface AccessTokenProvider {
  getAccessToken(options?: { forceRefresh?: boolean }): Promise<string | null>;
}

let accessTokenProvider: AccessTokenProvider | null = null;

/** Registers (or with null removes) the single source of access tokens for every API request. */
export function setAccessTokenProvider(provider: AccessTokenProvider | null): void {
  accessTokenProvider = provider;
}

/**
 * A bearer token may only travel over HTTPS, or over HTTP to this machine,
 * the Android emulator's host alias or a private network (the development
 * setups in .env.example). Anything else would expose it on the way.
 */
export function canSendBearerToken(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol === 'https:') return true;
  if (parsed.protocol !== 'http:') return false;

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host === '::1' || host.endsWith('.local')) return true;
  const octets = host.split('.');
  if (octets.length !== 4 || octets.some((octet) => !/^\d{1,3}$/.test(octet) || Number(octet) > 255)) return false;
  const [a, b] = octets.map(Number);
  return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

type QueryValue = string | number | undefined;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  query?: Record<string, QueryValue>;
  body?: unknown;
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
  const provider = canSendBearerToken(url) ? accessTokenProvider : null;

  let accessToken = provider ? await getAccessToken(provider, false) : null;
  let response = await send(url, options, accessToken);

  // A 401 for a token the app thought was valid (revoked, or the clocks
  // disagree): renew it once and repeat the request. Safe for a POST too,
  // because the API rejects the token before the endpoint runs.
  if (response.status === 401 && provider && accessToken) {
    accessToken = await getAccessToken(provider, true);
    if (accessToken) response = await send(url, options, accessToken);
  }

  return readResponse<T>(url, response);
}

async function getAccessToken(provider: AccessTokenProvider, forceRefresh: boolean): Promise<string | null> {
  try {
    return await provider.getAccessToken(forceRefresh ? { forceRefresh } : undefined);
  } catch (error) {
    // Never includes the token; the AuthFlowError in `cause` says why.
    throw new ApiError('auth', 'Could not get an access token.', undefined, undefined, error);
  }
}

async function send(url: string, options: RequestOptions, accessToken: string | null): Promise<Response> {
  // fetch has no built-in timeout; abort it ourselves so a phone that cannot
  // reach the PC shows an error instead of spinning forever.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      method: options.method ?? 'GET',
      headers: {
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
    throw new ApiError(
      'http',
      problem?.detail ?? problem?.title ?? `HTTP ${response.status} from ${url}`,
      response.status,
      problem,
    );
  }

  return payload as T;
}

function isProblemDetails(value: unknown): value is ProblemDetails {
  return typeof value === 'object' && value !== null && ('title' in value || 'status' in value);
}

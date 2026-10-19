import { apiBaseUrl } from '../config/env';
import type { ProblemDetails } from '../models/problem-details';

const REQUEST_TIMEOUT_MS = 10_000;

export type ApiErrorKind = 'network' | 'timeout' | 'http' | 'invalid-response' | 'not-configured';

// One error type for everything that can go wrong in a request, so screens
// only need a single catch branch.
export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    message: string,
    readonly status?: number,
    readonly problem?: ProblemDetails,
  ) {
    super(message);
    this.name = 'ApiError';
  }
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

  // fetch has no built-in timeout; abort it ourselves so a phone that cannot
  // reach the PC shows an error instead of spinning forever.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        ...(options.body !== undefined && { 'Content-Type': 'application/json' }),
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

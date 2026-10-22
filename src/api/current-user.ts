import type { CurrentUserResponse } from '../models/current-user';
import { ApiError, requestJson } from './http-client';

/** GET /api/me: the identity the API derives from the access token. Needs a signed-in user. */
export function fetchCurrentUser(): Promise<CurrentUserResponse> {
  return requestJson<CurrentUserResponse>('/api/me');
}

/** What the account panel says about the API's view of the signed-in user. */
export type ServerIdentity =
  | { status: 'checking' }
  | { status: 'verified'; identity: CurrentUserResponse }
  /** The API has no /api/me yet (an API version without login). */
  | { status: 'unsupported' }
  /** The API runs without Entra settings. */
  | { status: 'not-configured' }
  /** The API rejected the token (401) or the user (403). */
  | { status: 'rejected'; message: string }
  | { status: 'error'; message: string };

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
    if (error.status === 403) {
      return { status: 'rejected', message: error.problem?.detail ?? "Din konto har ikke adgang til API'et." };
    }
  }
  return { status: 'error', message: describe(error) };
}

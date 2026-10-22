import { useEffect, useState } from 'react';

import { classifyCurrentUserError, fetchCurrentUser, type ServerIdentity } from '../api/current-user';
import { describeError } from '../api/error-messages';
import type { AuthUser } from '../auth/id-token';
import { isDemoMode } from '../config/env';

/**
 * Asks the API who it thinks the signed-in user is (GET /api/me), so the
 * app never presents the user as verified on the strength of its own ID
 * token alone. null in demo mode or when nobody is signed in.
 */
export function useServerIdentity(user: AuthUser | null): { identity: ServerIdentity | null; recheck(): void } {
  const [identity, setIdentity] = useState<ServerIdentity | null>(null);
  const [attempt, setAttempt] = useState(0);
  // Same person → same check; a different account → check again.
  const userKey = user ? `${user.tenantId}/${user.objectId}` : null;

  useEffect(() => {
    if (isDemoMode || userKey === null) {
      setIdentity(null);
      return;
    }
    let current = true;
    setIdentity({ status: 'checking' });
    fetchCurrentUser().then(
      (response) => current && setIdentity({ status: 'verified', identity: response }),
      (error: unknown) => current && setIdentity(classifyCurrentUserError(error, describeError)),
    );
    return () => {
      current = false;
    };
  }, [userKey, attempt]);

  return { identity, recheck: () => setAttempt((value) => value + 1) };
}

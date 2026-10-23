import { useEffect, useState } from 'react';

import { currentUserApi, verifyAndRegister, type ServerIdentity } from '../api/current-user';
import { describeError } from '../api/error-messages';
import { canSendBearerTokenToApi } from '../api/http-client';
import type { AuthUser } from '../auth/id-token';
import { isDemoMode } from '../config/env';

/**
 * Asks the API who it thinks the signed-in user is (GET /api/me), so the
 * app never presents the user as verified on the strength of its own ID
 * token alone, and registers the user with the API the first time
 * (POST /api/me/registration). null in demo mode or when nobody is signed in.
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
    // The token would not be sent, so the API could only answer 401.
    if (!canSendBearerTokenToApi()) {
      setIdentity({ status: 'insecure-transport' });
      return;
    }
    let current = true;
    setIdentity({ status: 'checking' });
    // Registration is idempotent on the API, so a check that is abandoned
    // (logout, another account) or repeated cannot create a second user.
    verifyAndRegister(currentUserApi, describeError, (verified) => {
      if (current) setIdentity({ status: 'registering', identity: verified });
    }).then((result) => current && setIdentity(result));
    return () => {
      current = false;
    };
  }, [userKey, attempt]);

  return { identity, recheck: () => setAttempt((value) => value + 1) };
}

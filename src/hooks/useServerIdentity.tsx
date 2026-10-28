import { useCallback, useEffect, useRef, useState } from 'react';

import { currentUserApi, shouldRecheckIdentity, verifyAndRegister, type ServerIdentity } from '../api/current-user';
import { describeError } from '../api/error-messages';
import { canSendBearerTokenToApi } from '../api/http-client';
import type { AuthUser } from '../auth/id-token';
import { isDemoMode } from '../config/env';

export interface ServerIdentityCheck {
  identity: ServerIdentity | null;
  recheck(): void;
  /**
   * An API answer said the access changed (setAccessChangedListener): checks
   * again if it refused the account itself, so a disabled account is not
   * shown as registered (see shouldRecheckIdentity).
   */
  accessChanged(code: string): void;
}

/**
 * Asks the API who it thinks the signed-in user is (GET /api/me), so the
 * app never presents the user as verified on the strength of its own ID
 * token alone, and registers the user with the API the first time
 * (POST /api/me/registration). null in demo mode or when nobody is signed in.
 */
export function useServerIdentity(user: AuthUser | null): ServerIdentityCheck {
  const [identity, setIdentity] = useState<ServerIdentity | null>(null);
  const [attempt, setAttempt] = useState(0);
  // The identity as last set, for accessChanged. Set before a check sends
  // its request, so the check's own answer always finds 'checking'.
  const latest = useRef<ServerIdentity | null>(null);
  // Same person → same check; a different account → check again.
  const userKey = user ? `${user.tenantId}/${user.objectId}` : null;

  useEffect(() => {
    const show = (next: ServerIdentity | null) => {
      latest.current = next;
      setIdentity(next);
    };
    if (isDemoMode || userKey === null) {
      show(null);
      return;
    }
    // The token would not be sent, so the API could only answer 401.
    if (!canSendBearerTokenToApi()) {
      show({ status: 'insecure-transport' });
      return;
    }
    let current = true;
    show({ status: 'checking' });
    // Registration is idempotent on the API, so a check that is abandoned
    // (logout, another account) or repeated cannot create a second user.
    verifyAndRegister(currentUserApi, describeError, (verified) => {
      if (current) show({ status: 'registering', identity: verified });
    }).then((result) => current && show(result));
    return () => {
      current = false;
    };
  }, [userKey, attempt]);

  const recheck = useCallback(() => setAttempt((value) => value + 1), []);
  const accessChanged = useCallback((code: string) => {
    if (!shouldRecheckIdentity(code, latest.current)) return;
    // Several refused requests can arrive before the check starts: one check.
    latest.current = { status: 'checking' };
    setAttempt((value) => value + 1);
  }, []);

  return { identity, recheck, accessChanged };
}

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Linking } from 'react-native';

import type { ServerIdentity } from '../api/current-user';
import { describeError } from '../api/error-messages';
import { liveOrganizationsApi } from '../api/organizations-api';
import { useAuth } from '../auth/AuthProvider';
import { useServerIdentity } from '../hooks/useServerIdentity';
import type { Organization } from '../models/organization';
import { invitationTokenFromUrl } from './invitation-link';
import { OrganizationController, type OrganizationsState } from './organization-controller';
import { selectionStore } from './selection-store';

interface Session {
  /** What the API says about the signed-in user; null in demo mode or when nobody is signed in. */
  identity: ServerIdentity | null;
  recheckIdentity(): void;
  organizations: OrganizationsState;
  controller: OrganizationController;
  /** A token from an invitation link that opened the app, until it is used or dismissed. */
  pendingInvitationToken: string | null;
  clearPendingInvitation(): void;
}

const SessionContext = createContext<Session | null>(null);

/**
 * The signed-in user as the API sees them, and their organisations. One
 * check of /api/me per sign-in, shared by every screen.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  const { identity, recheck } = useServerIdentity(state.status === 'signed-in' ? state.user : null);
  const [controller] = useState(
    () => new OrganizationController({ api: liveOrganizationsApi, store: selectionStore, describe: describeError }),
  );
  const organizations = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
  const pendingInvitationToken = useInvitationLink();
  const [dismissedToken, setDismissedToken] = useState<string | null>(null);

  const registeredUser = identity?.status === 'registered' ? identity.user : null;
  const registeredId = registeredUser?.publicId ?? null;

  useEffect(() => {
    if (registeredUser === null) {
      controller.deactivate();
      return;
    }
    const fromMe: Organization[] = registeredUser.organizations.map((organization) => ({ ...organization }));
    void controller.activate(registeredUser.publicId, fromMe);
    // Only a different user starts over; the same user's identity object
    // changing (a recheck) refreshes inside activate.
  }, [controller, registeredId]);

  return (
    <SessionContext.Provider
      value={{
        identity,
        recheckIdentity: recheck,
        organizations,
        controller,
        pendingInvitationToken: pendingInvitationToken === dismissedToken ? null : pendingInvitationToken,
        clearPendingInvitation: () => setDismissedToken(pendingInvitationToken),
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession must be used inside <SessionProvider>');
  return session;
}

/**
 * The token of the last invitation link (roombookingdev://invitation?token=…)
 * that opened the app or arrived while it ran. Other links, such as the
 * login redirect, are ignored. The token is never logged.
 */
function useInvitationLink(): string | null {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    const handle = (url: string | null | undefined) => {
      const found = url ? invitationTokenFromUrl(url) : null;
      if (found && current) setToken(found);
    };
    Linking.getInitialURL()
      .then(handle)
      .catch(() => undefined);
    const subscription = Linking.addEventListener('url', ({ url }) => handle(url));
    return () => {
      current = false;
      subscription.remove();
    };
  }, []);

  return token;
}

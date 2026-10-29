import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';

import type { AccessGrant } from '../api/http-client';
import type { AuthController, AuthState } from './auth-controller';
import { getAuthController } from './auth-runtime';
import type { AuthProviderId, AuthUser } from './id-token';

const AuthContext = createContext<AuthController | null>(null);

/** Makes the login state available to every screen and restores a saved session on start. */
export function AuthProvider({ children, controller = getAuthController() }: { children: ReactNode; controller?: AuthController }) {
  useEffect(() => {
    void controller.start();
  }, [controller]);

  return <AuthContext.Provider value={controller}>{children}</AuthContext.Provider>;
}

export interface UseAuth {
  state: AuthState;
  /** The ways to sign in on this device: 'entra', and 'external-id' when configured. */
  providers: readonly AuthProviderId[];
  signIn(provider?: AuthProviderId): void;
  signOut(): void;
  /** A second sign-in that leaves the session alone, for linking an identity (AuthController.proveIdentity). */
  proveIdentity(provider: AuthProviderId): Promise<{ user: AuthUser; grant: AccessGrant }>;
}

/** The login state (without tokens) and the actions. Re-renders when the state changes. */
export function useAuth(): UseAuth {
  const controller = useContext(AuthContext);
  if (!controller) throw new Error('useAuth must be used inside <AuthProvider>');
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
  return {
    state,
    providers: controller.getProviders(),
    signIn: (provider) => void controller.signIn(provider),
    signOut: () => void controller.signOut(),
    proveIdentity: (provider) => controller.proveIdentity(provider),
  };
}

import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react';

import type { AuthController, AuthState } from './auth-controller';
import { getAuthController } from './auth-runtime';

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
  signIn(): void;
  signOut(): void;
}

/** The login state (without tokens) and the actions. Re-renders when the state changes. */
export function useAuth(): UseAuth {
  const controller = useContext(AuthContext);
  if (!controller) throw new Error('useAuth must be used inside <AuthProvider>');
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState);
  return {
    state,
    signIn: () => void controller.signIn(),
    signOut: () => void controller.signOut(),
  };
}

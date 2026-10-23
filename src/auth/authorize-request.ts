// The authorization request the app sends to Microsoft, as plain data, so
// the endpoint, scopes and parameters can be tested without React Native.
// auth-runtime.native.ts turns it into an expo-auth-session AuthRequest,
// which adds the PKCE challenge (S256), a random state and
// prompt=select_account.
//
// Platform-independent on purpose, so it runs in the Node tests.
import type { EntraConfig } from './entra-config';

export interface AuthorizeRequest {
  /** The tenant's authorize endpoint: /common/ accepts both kinds of Microsoft account. */
  authorizationEndpoint: string;
  clientId: string;
  redirectUri: string;
  scopes: string[];
  /** Always on: the app is a public client without a secret. */
  usePKCE: true;
  /**
   * Nothing extra. In particular no domain_hint or login_hint: on /common,
   * Microsoft finds out from the e-mail address whether it is a personal or
   * a work or school account, and a hint would skip that for one kind.
   */
  extraParams: Record<string, string>;
}

export function buildAuthorizeRequest(config: EntraConfig, redirectUri: string): AuthorizeRequest {
  return {
    authorizationEndpoint: config.authorizationEndpoint,
    clientId: config.clientId,
    redirectUri,
    scopes: [...config.scopes],
    usePKCE: true,
    extraParams: {},
  };
}

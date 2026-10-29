// The authorization request the app sends to Microsoft, as plain data, so
// the endpoint, scopes and parameters can be tested without React Native.
// auth-runtime.native.ts turns it into an expo-auth-session AuthRequest,
// which adds the PKCE challenge (S256) and a random state.
//
// Platform-independent on purpose, so it runs in the Node tests.
import type { EntraConfig } from './entra-config';
import type { ExternalIdConfig } from './external-id-config';

export interface AuthorizeRequest {
  /** The tenant's authorize endpoint: /common/ accepts both kinds of Microsoft account. */
  authorizationEndpoint: string;
  clientId: string;
  redirectUri: string;
  scopes: string[];
  /** Always on: the app is a public client without a secret. */
  usePKCE: true;
  /**
   * select_account: Microsoft's account picker, also right after signing
   * out. login: the e-mail page asks for the address and sends a new code
   * every time, instead of reusing the browser's last e-mail session.
   */
  prompt: 'select_account' | 'login';
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
    prompt: 'select_account',
    extraParams: {},
  };
}

/** E-mail and one-time code: the external tenant's own endpoint and app registration. */
export function buildExternalIdAuthorizeRequest(config: ExternalIdConfig, redirectUri: string): AuthorizeRequest {
  return {
    authorizationEndpoint: config.authorizationEndpoint,
    clientId: config.clientId,
    redirectUri,
    scopes: [...config.scopes],
    usePKCE: true,
    prompt: 'login',
    extraParams: {},
  };
}

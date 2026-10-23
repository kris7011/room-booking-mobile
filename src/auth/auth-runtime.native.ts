// Android and iOS: wires the AuthController to the real browser login
// (expo-auth-session), Entra's token endpoint and SecureStore. Metro picks
// this file over auth-runtime.ts on native, so none of it reaches the web
// bundle.
import { isRunningInExpoGo } from 'expo';
import { AuthRequest, Prompt, ResponseType } from 'expo-auth-session';
import { Platform } from 'react-native';

import { setAccessTokenProvider } from '../api/http-client';
import { AuthController, type AuthorizeResult } from './auth-controller';
import { AuthFlowError, oauthError } from './auth-errors';
import { describeAuthAvailability, resolveAuthAvailability } from './auth-availability';
import { buildAuthorizeRequest } from './authorize-request';
import { entraConfigResult, type EntraConfig } from './entra-config';
import { readIdTokenUser } from './id-token';
import { getAuthRedirectUri } from './redirect-uri';
import { secureSessionStore } from './secure-store.native';
import { redeemAuthorizationCode, redeemRefreshToken, type TokenClientConfig } from './token-client';

let controller: AuthController | null = null;

/** The app's single AuthController, created on first use. */
export function getAuthController(): AuthController {
  controller ??= createController();
  return controller;
}

function createController(): AuthController {
  const availability = resolveAuthAvailability(Platform.OS, entraConfigResult, getAuthRedirectUri(), isRunningInExpoGo());
  // Development only: shows in Metro and logcat which login page the app
  // opens (…/common/… for personal and work or school accounts).
  if (__DEV__) console.info(describeAuthAvailability(availability));
  if (!availability.available) return AuthController.unavailable(availability.reason, availability.detail);

  const { config, redirectUri } = availability;
  const tokenConfig: TokenClientConfig = {
    clientId: config.clientId,
    tokenEndpoint: config.tokenEndpoint,
    redirectUri,
    scopes: config.scopes,
    apiScope: config.apiScope,
  };

  const authController = AuthController.create({
    store: secureSessionStore,
    authorize: () => authorize(config, redirectUri),
    redeemCode: (code, codeVerifier) => redeemAuthorizationCode(tokenConfig, { code, codeVerifier }),
    refresh: (refreshToken) => redeemRefreshToken(tokenConfig, refreshToken),
    readUser: (idToken) =>
      readIdTokenUser(idToken, { clientId: config.clientId, requiredTenantId: config.requiredTenantId, nowMs: Date.now() }),
  });
  // Every API request now gets its token from here.
  setAccessTokenProvider(authController);
  return authController;
}

/**
 * Opens the Microsoft login in a Custom Tab (Android) or an
 * ASWebAuthenticationSession (iOS) and waits for roombookingdev://auth.
 * AuthRequest creates the PKCE verifier and challenge (S256) and a random
 * state, and rejects a redirect whose state does not match.
 */
async function authorize(config: EntraConfig, redirectUri: string): Promise<AuthorizeResult> {
  const { authorizationEndpoint, ...options } = buildAuthorizeRequest(config, redirectUri);
  const request = new AuthRequest({
    ...options,
    responseType: ResponseType.Code,
    // Let the user pick an account, also right after signing out.
    prompt: Prompt.SelectAccount,
  });

  const result = await request.promptAsync({ authorizationEndpoint });

  switch (result.type) {
    case 'success': {
      const code = result.params.code;
      if (!code || !request.codeVerifier) throw new AuthFlowError('invalid-response', 'No authorization code');
      return { type: 'success', code, codeVerifier: request.codeVerifier };
    }
    case 'error': {
      const error = result.error;
      throw oauthError(error?.code ?? result.params.error ?? 'unknown', error?.params?.error_description ?? result.params.error_description);
    }
    case 'locked':
      throw new AuthFlowError('busy', 'Another login is open');
    default:
      // cancel or dismiss: the user closed the browser.
      return { type: 'cancel' };
  }
}

// TypeScript resolves imports of './auth-runtime' to the web file, so make
// sure this file offers the same function with the same type.
({ getAuthController }) satisfies typeof import('./auth-runtime');

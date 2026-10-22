// Decides whether Microsoft login can be offered on this device. Without
// it the app keeps working exactly as before: on demo data, or against an
// API whose current endpoints need no login.
import type { AuthUnavailableReason } from './auth-controller';
import { NATIVE_REDIRECT_URI } from './auth-config';
import type { EntraConfig, EntraConfigResult } from './entra-config';

export type AuthAvailability =
  | { available: true; config: EntraConfig; redirectUri: string }
  | { available: false; reason: AuthUnavailableReason; detail?: string };

export function resolveAuthAvailability(
  platform: string,
  configResult: EntraConfigResult,
  redirectUri: string | null,
): AuthAvailability {
  // The Angular app owns Microsoft login in the browser.
  if (platform === 'web' || redirectUri === null) return { available: false, reason: 'web' };
  if (!configResult.configured) {
    return configResult.problem
      ? { available: false, reason: 'invalid-config', detail: configResult.problem }
      : { available: false, reason: 'not-configured' };
  }
  // Expo Go returns an exp:// redirect URI, which is not registered in Entra
  // and would end in AADSTS50011. Only the development build has the scheme.
  if (redirectUri !== NATIVE_REDIRECT_URI) return { available: false, reason: 'expo-go', detail: redirectUri };
  return { available: true, config: configResult.config, redirectUri };
}

/** Why login is not offered, for the account panel. */
export function describeUnavailable(reason: AuthUnavailableReason, detail?: string): string {
  switch (reason) {
    case 'web':
      return 'Microsoft-login findes kun i Android- og iOS-appen. Web-udgaven kører uden login.';
    case 'not-configured':
      return 'Microsoft-login er ikke sat op (EXPO_PUBLIC_ENTRA_CLIENT_ID og EXPO_PUBLIC_ENTRA_API_SCOPE). Appen kører uden login.';
    case 'invalid-config':
      return `Microsoft-login er slået fra: ${detail ?? 'ugyldige Entra-indstillinger.'}`;
    case 'expo-go':
      return `Microsoft-login kræver development build'en (redirect ${NATIVE_REDIRECT_URI}). Expo Go kører uden login.`;
  }
}

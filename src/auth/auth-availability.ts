// Decides whether Microsoft login can be offered on this device. Without
// it the app keeps working exactly as before: on demo data, or against an
// API whose current endpoints need no login.
import type { AuthUnavailableReason } from './auth-controller';
import { NATIVE_REDIRECT_URI } from './auth-config';
import { describeAccountTypes, type EntraConfig, type EntraConfigResult } from './entra-config';
import type { ExternalIdConfigResult } from './external-id-config';

export type AuthAvailability =
  | { available: true; config: EntraConfig; redirectUri: string }
  | { available: false; reason: AuthUnavailableReason; detail?: string };

/**
 * `runningInExpoGo` comes from `isRunningInExpoGo()` (package `expo`) and is
 * passed in so the rule can be tested without React Native.
 */
export function resolveAuthAvailability(
  platform: string,
  configResult: EntraConfigResult,
  redirectUri: string | null,
  runningInExpoGo = false,
): AuthAvailability {
  // Microsoft login is not implemented in the browser.
  if (platform === 'web' || redirectUri === null) return { available: false, reason: 'web' };
  if (!configResult.configured) {
    return configResult.problem
      ? { available: false, reason: 'invalid-config', detail: configResult.problem }
      : { available: false, reason: 'not-configured' };
  }
  // Expo Go can never finish the login: Microsoft redirects to
  // roombookingdev://auth, which opens the development build, not Expo Go.
  // Checked on its own, because the redirect URI alone does not reveal Expo
  // Go in every SDK version.
  if (runningInExpoGo) return { available: false, reason: 'expo-go', detail: redirectUri };
  // An exp:// redirect URI is not registered in Entra and would end in
  // AADSTS50011. Only the development build has the scheme.
  if (redirectUri !== NATIVE_REDIRECT_URI) return { available: false, reason: 'expo-go', detail: redirectUri };
  return { available: true, config: configResult.config, redirectUri };
}

/**
 * One line for the development log, so a test on a phone shows which login
 * the app will open: the authorize endpoint (with its tenant) and the
 * accounts it accepts. Contains no client ID, code or token.
 */
export function describeAuthAvailability(availability: AuthAvailability): string {
  if (!availability.available) {
    return `[auth] Microsoft login unavailable: ${availability.reason}${availability.detail ? ` (${availability.detail})` : ''}`;
  }
  const { config } = availability;
  return `[auth] Microsoft login: ${config.authorizationEndpoint} (${describeAccountTypes(config.tenant)})`;
}

/**
 * One line for the development log about e-mail sign-in: the authorize
 * endpoint it opens, or why it is not offered. No client ID or token.
 */
export function describeExternalIdAvailability(result: ExternalIdConfigResult): string {
  if (result.configured) return `[auth] E-mail one-time-code login: ${result.config.authorizationEndpoint}`;
  return result.problem
    ? `[auth] E-mail one-time-code login unavailable: ${result.problem}`
    : '[auth] E-mail one-time-code login not configured';
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
      return (
        `Microsoft-login virker ikke i Expo Go (redirect ${NATIVE_REDIRECT_URI}). ` +
        'Åbn appen "Room Booking" (development build\'en) i stedet. Søgning og booking virker her uden login.'
      );
  }
}

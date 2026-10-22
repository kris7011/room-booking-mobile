// Android and iOS. Metro picks this file over redirect-uri.ts on native, so
// expo-auth-session never ends up in the web bundle.
import { makeRedirectUri } from 'expo-auth-session';
import { Platform } from 'react-native';

import { describeAuthRedirectUri, resolveAuthRedirectUri } from './auth-config';

/** `roombookingdev://auth` in a development build, an `exp://` URL in Expo Go. */
export function getAuthRedirectUri(): string | null {
  return resolveAuthRedirectUri(Platform.OS, makeRedirectUri);
}

/** Writes the redirect URI to the Metro terminal, so it can be checked on a device. */
export function logAuthRedirectUri(): void {
  const message = describeAuthRedirectUri(getAuthRedirectUri());
  if (message) console.info(message);
}

// TypeScript resolves imports of './redirect-uri' to the web file, so make
// sure this file offers the same functions with the same types.
({ getAuthRedirectUri, logAuthRedirectUri }) satisfies typeof import('./redirect-uri');

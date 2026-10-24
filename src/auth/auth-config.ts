// Redirect configuration for the coming Microsoft (Entra ID) login on Android.
// Nothing here logs in, exchanges tokens or stores a session yet: this file
// only pins down the redirect URI, so the value registered in Entra, the
// scheme in app.json and what the app asks for at runtime cannot drift apart.
//
// Platform-independent on purpose, so it runs in the Node tests. The call to
// expo-auth-session lives in redirect-uri.native.ts.

/** URL scheme of the development build. Must equal `expo.scheme` in app.json. */
export const AUTH_SCHEME = 'roombookingdev';

/** Path the identity provider redirects back to. */
export const AUTH_REDIRECT_PATH = 'auth';

/** The redirect URI to register in Entra ID as a "Mobile and desktop applications" URI. */
export const NATIVE_REDIRECT_URI = `${AUTH_SCHEME}://${AUTH_REDIRECT_PATH}`;

/** The subset of expo-auth-session's AuthSessionRedirectUriOptions that the app sets. */
export interface AuthRedirectUriOptions {
  scheme: string;
  path: string;
  native: string;
}

/**
 * Options for `makeRedirectUri`. In a development or release build
 * (`Constants.executionEnvironment` "bare" or "standalone"), `native` takes
 * precedence over everything else, so the result is exactly
 * NATIVE_REDIRECT_URI. `scheme` and `path` give the same URI should the
 * `native` shortcut not apply. Expo Go ignores both and returns an `exp://` URL.
 */
export const authRedirectUriOptions: Readonly<AuthRedirectUriOptions> = Object.freeze({
  scheme: AUTH_SCHEME,
  path: AUTH_REDIRECT_PATH,
  native: NATIVE_REDIRECT_URI,
});

export type MakeRedirectUri = (options: AuthRedirectUriOptions) => string;

/**
 * The redirect URI for this platform, or null on web: Microsoft login is
 * not implemented in the browser.
 * `makeRedirectUri` is passed in so the rule can be tested without React Native.
 */
export function resolveAuthRedirectUri(platform: string, makeRedirectUri: MakeRedirectUri): string | null {
  if (platform === 'web') return null;
  return makeRedirectUri({ ...authRedirectUriOptions });
}

/**
 * A one-line description of the resolved redirect URI for the development
 * log, so a development build can be checked on the device. The URI is not
 * a secret; nothing else is logged.
 */
export function describeAuthRedirectUri(uri: string | null): string | null {
  if (uri === null) return null;
  if (uri === NATIVE_REDIRECT_URI) return `[auth] Redirect URI: ${uri}`;
  return (
    `[auth] Redirect URI: ${uri} (not ${NATIVE_REDIRECT_URI}: ` +
    'Microsoft login needs the Android development build, not Expo Go)'
  );
}

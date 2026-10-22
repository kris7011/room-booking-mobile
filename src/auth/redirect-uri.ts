// Web. Expo web has no Microsoft login: the Angular app has its own. On
// Android and iOS, Metro uses redirect-uri.native.ts instead of this file,
// which must export the same functions.

/** Always null on web. */
export function getAuthRedirectUri(): string | null {
  return null;
}

/** Nothing to log on web. */
export function logAuthRedirectUri(): void {}

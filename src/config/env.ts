// EXPO_PUBLIC_ variables are inlined into the bundle at build time, and only
// when read with static dot notation (process.env.EXPO_PUBLIC_API_URL).
// Never put secrets here: the value is visible in the shipped app.
const rawApiUrl = process.env.EXPO_PUBLIC_API_URL?.trim() ?? '';

/** Base URL of the .NET API without a trailing slash, or null when unset. */
export const apiBaseUrl: string | null = rawApiUrl ? rawApiUrl.replace(/\/+$/, '') : null;

/**
 * Without an API URL the app runs on clearly labelled demo data, so the UI can
 * be developed and tested while the backend is not running.
 */
export const isDemoMode = apiBaseUrl === null;

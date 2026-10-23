// Import this FIRST in a test file to run the app code against an HTTPS API,
// the only kind of public address a bearer token may be sent to. The host
// never resolves: tests replace fetch.
export const TEST_HTTPS_API_URL = 'https://api.test';

process.env.EXPO_PUBLIC_API_URL = TEST_HTTPS_API_URL;

// Import this FIRST in a test file to run the app code in live-API mode.
// The host never resolves: tests replace fetch, so no request leaves the process.
export const TEST_API_URL = 'http://api.test:5003';

// Trailing slash on purpose: env.ts must strip it.
process.env.EXPO_PUBLIC_API_URL = `${TEST_API_URL}/`;

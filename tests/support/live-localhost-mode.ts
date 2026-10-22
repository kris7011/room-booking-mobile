// Import this FIRST in a test file to run the app code against an API on
// http://localhost:5003: the address a physical phone uses with
// `adb reverse tcp:5003 tcp:5003`, and the iOS Simulator's. Tests replace fetch.
export const TEST_LOCALHOST_API_URL = 'http://localhost:5003';

process.env.EXPO_PUBLIC_API_URL = TEST_LOCALHOST_API_URL;

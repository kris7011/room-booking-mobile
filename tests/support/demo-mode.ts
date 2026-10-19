// Import this FIRST in a test file: src/config/env.ts reads the variable once,
// when it is first loaded. Node runs each test file in its own process, so the
// mode chosen here only applies to the file that imports it.
delete process.env.EXPO_PUBLIC_API_URL;

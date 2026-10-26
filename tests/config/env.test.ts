import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';

type EnvModule = typeof import('../../src/config/env');

const envModulePath = require.resolve('../../src/config/env');
const originalValue = process.env.EXPO_PUBLIC_API_URL;

// env.ts evaluates the variable once at load time (in the app, Expo inlines it
// at bundle time). Re-load the module to try different values in one file.
function loadEnv(value: string | undefined): EnvModule {
  if (value === undefined) {
    delete process.env.EXPO_PUBLIC_API_URL;
  } else {
    process.env.EXPO_PUBLIC_API_URL = value;
  }
  delete require.cache[envModulePath];
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- a fresh module instance per value; import() is cached
  return require(envModulePath) as EnvModule;
}

afterEach(() => {
  loadEnv(originalValue);
});

test('unset → demo mode', () => {
  const env = loadEnv(undefined);
  assert.equal(env.isDemoMode, true);
  assert.equal(env.apiBaseUrl, null);
});

test('empty or whitespace → demo mode', () => {
  assert.equal(loadEnv('').isDemoMode, true);
  assert.equal(loadEnv('   ').isDemoMode, true);
});

test('a URL → live mode, trimmed and without trailing slashes', () => {
  const env = loadEnv('  http://10.0.2.2:5003//  ');
  assert.equal(env.isDemoMode, false);
  assert.equal(env.apiBaseUrl, 'http://10.0.2.2:5003');
});

test('a path prefix is kept', () => {
  assert.equal(loadEnv('https://example.com/booking/').apiBaseUrl, 'https://example.com/booking');
});

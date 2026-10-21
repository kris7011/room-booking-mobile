import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  AUTH_REDIRECT_PATH,
  AUTH_SCHEME,
  type AuthRedirectUriOptions,
  NATIVE_REDIRECT_URI,
  authRedirectUriOptions,
  describeAuthRedirectUri,
  resolveAuthRedirectUri,
} from '../../src/auth/auth-config';

// What expo-auth-session 58's makeRedirectUri does with these options (see
// node_modules/expo-auth-session/build/AuthSession.js): on Android and iOS in
// a "bare" or "standalone" build it returns `native` unchanged; in Expo Go
// ("storeClient") it ignores `native` and an unknown scheme and builds an
// exp:// URL. A development build on Android reports "bare" (expo-constants'
// ConstantsService.kt), and the app config test checks the native side.
function fakeMakeRedirectUri(executionEnvironment: 'bare' | 'standalone' | 'storeClient') {
  const calls: AuthRedirectUriOptions[] = [];
  const make = (options: AuthRedirectUriOptions): string => {
    calls.push(options);
    if (executionEnvironment !== 'storeClient') return options.native;
    return `exp://192.168.1.20:8081/--/${options.path}`;
  };
  return { make, calls };
}

test('the native redirect URI is exactly roombookingdev://auth', () => {
  assert.equal(AUTH_SCHEME, 'roombookingdev');
  assert.equal(AUTH_REDIRECT_PATH, 'auth');
  assert.equal(NATIVE_REDIRECT_URI, 'roombookingdev://auth');
});

test('makeRedirectUri gets the scheme, the path and the exact native URI', () => {
  assert.deepEqual(authRedirectUriOptions, {
    scheme: 'roombookingdev',
    path: 'auth',
    native: 'roombookingdev://auth',
  });
  assert.ok(Object.isFrozen(authRedirectUriOptions));
});

test('Android development build → roombookingdev://auth', () => {
  const { make, calls } = fakeMakeRedirectUri('bare');
  assert.equal(resolveAuthRedirectUri('android', make), 'roombookingdev://auth');
  assert.deepEqual(calls, [{ scheme: 'roombookingdev', path: 'auth', native: 'roombookingdev://auth' }]);
});

test('release build → the same URI', () => {
  assert.equal(resolveAuthRedirectUri('android', fakeMakeRedirectUri('standalone').make), NATIVE_REDIRECT_URI);
});

test('makeRedirectUri gets a copy, so it cannot change the shared options', () => {
  resolveAuthRedirectUri('android', (options) => {
    options.native = 'changed://';
    return options.native;
  });
  assert.equal(authRedirectUriOptions.native, 'roombookingdev://auth');
});

test('web → no redirect URI, and makeRedirectUri is not called', () => {
  const { make, calls } = fakeMakeRedirectUri('bare');
  assert.equal(resolveAuthRedirectUri('web', make), null);
  assert.equal(calls.length, 0);
});

test('the development log line names the URI and flags Expo Go', () => {
  assert.equal(describeAuthRedirectUri('roombookingdev://auth'), '[auth] Redirect URI: roombookingdev://auth');

  const expoGo = resolveAuthRedirectUri('android', fakeMakeRedirectUri('storeClient').make);
  assert.equal(expoGo, 'exp://192.168.1.20:8081/--/auth');
  const line = describeAuthRedirectUri(expoGo);
  assert.match(line ?? '', /^\[auth\] Redirect URI: exp:\/\/192\.168\.1\.20:8081\/--\/auth \(not roombookingdev:\/\/auth: /);
  assert.match(line ?? '', /development build/);

  assert.equal(describeAuthRedirectUri(null), null);
});

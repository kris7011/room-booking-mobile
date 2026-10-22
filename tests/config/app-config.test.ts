import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { before, test } from 'node:test';

import { AUTH_SCHEME } from '../../src/auth/auth-config';

// Compiled to .test-build/tests/config/, three levels below the project root.
const projectRoot = resolve(__dirname, '..', '..', '..');

const ANDROID_PACKAGE = 'io.github.kris7011.roombooking.dev';

interface XmlNode {
  $?: Record<string, string>;
  [child: string]: XmlNode[] | Record<string, string> | undefined;
}

interface IntrospectedConfig {
  scheme?: unknown;
  android?: { package?: string; scheme?: unknown };
  _internal: { modResults: { android: { manifest: { manifest: XmlNode } } } };
}

function children(node: XmlNode | undefined, name: string): XmlNode[] {
  const value = node?.[name];
  return Array.isArray(value) ? value : [];
}

function names(nodes: XmlNode[]): string[] {
  return nodes.map((node) => node.$?.['android:name'] ?? '');
}

const appJson = JSON.parse(readFileSync(resolve(projectRoot, 'app.json'), 'utf8')) as {
  expo: { scheme?: unknown; android?: { package?: string; scheme?: unknown }; ios?: { scheme?: unknown }; plugins?: unknown[] };
};
const packageJson = JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf8')) as {
  dependencies: Record<string, string>;
  scripts: Record<string, string>;
};

test('app.json: one scheme, the one the redirect URI uses', () => {
  // A single string: with several schemes, expo-linking warns and picks the first.
  assert.equal(appJson.expo.scheme, AUTH_SCHEME);
  assert.equal(appJson.expo.android?.scheme, undefined);
  assert.equal(appJson.expo.ios?.scheme, undefined);
});

test('app.json: Android package of the development app', () => {
  assert.equal(appJson.expo.android?.package, ANDROID_PACKAGE);
});

test('app.json: config plugins for the browser and secure storage', () => {
  assert.deepEqual(appJson.expo.plugins, [
    'expo-web-browser',
    'expo-secure-store',
    ['expo-build-properties', { android: { cmakeVersion: '3.31.6' } }],
    'expo-status-bar',
  ]);
});

test('package.json: the auth modules are dependencies, Expo Go keeps its own scripts', () => {
  for (const name of ['expo-dev-client', 'expo-auth-session', 'expo-crypto', 'expo-web-browser', 'expo-secure-store']) {
    assert.match(packageJson.dependencies[name] ?? '', /^~58\./, `${name} must be an SDK 58 version`);
  }
  assert.equal(packageJson.scripts['start:go'], 'expo start --go');
  assert.equal(packageJson.scripts['android:go'], 'expo start --go --android');
  assert.equal(packageJson.scripts['android:dev-build'], 'expo run:android');
});

// The generated Android project is not checked in (Continuous Native
// Generation), so ask Expo what `expo prebuild` would write, with every
// config plugin applied, without creating android/.
let manifest: XmlNode;

before(() => {
  const expoCli = require.resolve('expo/bin/cli', { paths: [projectRoot] });
  const result = spawnSync(process.execPath, [expoCli, 'config', '--type', 'introspect', '--json'], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: { ...process.env, EXPO_NO_DOTENV: '1', EXPO_NO_TELEMETRY: '1', CI: '1' },
    maxBuffer: 32 * 1024 * 1024,
  });
  assert.equal(result.status, 0, `expo config --type introspect failed:\n${result.stderr}`);
  const config = JSON.parse(result.stdout) as IntrospectedConfig;
  assert.equal(config.scheme, AUTH_SCHEME);
  assert.equal(config.android?.package, ANDROID_PACKAGE);
  manifest = config._internal.modResults.android.manifest.manifest;
});

test('Android manifest: MainActivity opens roombookingdev:// links from a browser', () => {
  const application = children(manifest, 'application')[0];
  const mainActivity = children(application, 'activity').find((a) => a.$?.['android:name'] === '.MainActivity');
  assert.ok(mainActivity, 'MainActivity missing');

  const deepLinkFilter = children(mainActivity, 'intent-filter').find((filter) =>
    names(children(filter, 'action')).includes('android.intent.action.VIEW'),
  );
  assert.ok(deepLinkFilter, 'no VIEW intent filter on MainActivity');
  assert.deepEqual(names(children(deepLinkFilter, 'category')).sort(), [
    'android.intent.category.BROWSABLE',
    'android.intent.category.DEFAULT',
  ]);

  const schemes = children(deepLinkFilter, 'data').map((data) => data.$?.['android:scheme']);
  assert.ok(schemes.includes(AUTH_SCHEME), `schemes: ${schemes.join(', ')}`);
  // Added by expo-dev-client, so the development build can open a dev server URL.
  assert.ok(schemes.includes('exp+room-booking-mobile'), `schemes: ${schemes.join(', ')}`);
});

test('Android manifest: release builds keep Android\'s default of no cleartext HTTP', () => {
  // Expo turns cleartext on only in the debug manifests (for Metro). The
  // main manifest must not, so a release build cannot send anything,
  // tokens included, over plain HTTP.
  const attributes = children(manifest, 'application')[0]?.$ ?? {};
  assert.equal(attributes['android:usesCleartextTraffic'], undefined);
  assert.equal(attributes['android:networkSecurityConfig'], undefined);
});

test('Android manifest: SecureStore data is excluded from Auto Backup', () => {
  const attributes = children(manifest, 'application')[0]?.$ ?? {};
  assert.equal(attributes['android:fullBackupContent'], '@xml/secure_store_backup_rules');
  assert.equal(attributes['android:dataExtractionRules'], '@xml/secure_store_data_extraction_rules');
});

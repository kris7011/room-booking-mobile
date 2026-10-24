import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, test } from 'node:test';

import {
  PERSONAL_ACCOUNTS_TENANT_ID,
  expectedIssuer,
  isGuid,
  isPersonalAccountTenant,
  resolveEntraConfig,
} from '../../src/auth/entra-config';
import { PERSONAL_TENANT_ID, TEST_API_SCOPE, TEST_CLIENT_ID, TEST_TENANT_ID } from '../support/entra-fixtures';

const projectRoot = resolve(__dirname, '..', '..', '..');

function problemOf(raw: Parameters<typeof resolveEntraConfig>[0]): string | null {
  const result = resolveEntraConfig(raw);
  assert.equal(result.configured, false);
  return result.configured ? null : result.problem;
}

describe('resolveEntraConfig', () => {
  test('nothing set → no login, and no problem to report', () => {
    assert.deepEqual(resolveEntraConfig({}), { configured: false, problem: null });
    assert.deepEqual(resolveEntraConfig({ clientId: '  ', apiScope: '' }), { configured: false, problem: null });
  });

  test('a client ID and an API scope → the common endpoints (personal, work and school accounts) and the four scopes', () => {
    const result = resolveEntraConfig({ clientId: ` ${TEST_CLIENT_ID} `, apiScope: TEST_API_SCOPE });
    assert.ok(result.configured);
    assert.deepEqual(result.config, {
      clientId: TEST_CLIENT_ID,
      apiScope: TEST_API_SCOPE,
      tenant: 'common',
      authorizationEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      tokenEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      scopes: ['openid', 'profile', 'offline_access', TEST_API_SCOPE],
      requiredTenantId: null,
    });
  });

  test('a blank tenant falls back to common', () => {
    const result = resolveEntraConfig({ clientId: TEST_CLIENT_ID, apiScope: TEST_API_SCOPE, tenant: '  ' });
    assert.ok(result.configured);
    assert.equal(result.config.tenant, 'common');
  });

  test('"organizations" limits login to work and school accounts', () => {
    const result = resolveEntraConfig({ clientId: TEST_CLIENT_ID, apiScope: TEST_API_SCOPE, tenant: 'organizations' });
    assert.ok(result.configured);
    assert.equal(result.config.authorizationEndpoint, 'https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize');
    assert.equal(result.config.tokenEndpoint, 'https://login.microsoftonline.com/organizations/oauth2/v2.0/token');
    assert.equal(result.config.requiredTenantId, null);
  });

  test('a tenant ID limits login to that tenant', () => {
    const result = resolveEntraConfig({ clientId: TEST_CLIENT_ID, apiScope: TEST_API_SCOPE, tenant: TEST_TENANT_ID.toUpperCase() });
    assert.ok(result.configured);
    assert.equal(result.config.requiredTenantId, TEST_TENANT_ID);
    assert.match(result.config.tokenEndpoint, new RegExp(`/${TEST_TENANT_ID.toUpperCase()}/oauth2/v2.0/token$`));
  });

  test('a domain or "common" is accepted without a tenant restriction', () => {
    for (const tenant of ['contoso.onmicrosoft.com', 'common']) {
      const result = resolveEntraConfig({ clientId: TEST_CLIENT_ID, apiScope: TEST_API_SCOPE, tenant });
      assert.ok(result.configured, tenant);
      assert.equal(result.config.requiredTenantId, null);
    }
  });

  test('only one of the two values → a problem naming the missing one', () => {
    assert.match(problemOf({ clientId: TEST_CLIENT_ID }) ?? '', /EXPO_PUBLIC_ENTRA_API_SCOPE mangler/);
    assert.match(problemOf({ apiScope: TEST_API_SCOPE }) ?? '', /EXPO_PUBLIC_ENTRA_CLIENT_ID mangler/);
  });

  test('a client ID that is not a GUID is rejected', () => {
    assert.match(problemOf({ clientId: 'my-app', apiScope: TEST_API_SCOPE }) ?? '', /GUID/);
  });

  test('a bare scope name or a scope of the app itself is rejected', () => {
    assert.match(problemOf({ clientId: TEST_CLIENT_ID, apiScope: 'access_as_user' }) ?? '', /fulde scope/);
    assert.match(
      problemOf({ clientId: TEST_CLIENT_ID, apiScope: `api://${TEST_CLIENT_ID}/access_as_user` }) ?? '',
      /mobilappens egen registrering/,
    );
  });

  test('a tenant that would change the URL, or "consumers", is rejected', () => {
    for (const tenant of ['contoso/../evil', 'a b', 'consumers', '?x=1']) {
      assert.match(problemOf({ clientId: TEST_CLIENT_ID, apiScope: TEST_API_SCOPE, tenant }) ?? '', /TENANT/, tenant);
    }
  });
});

test('expectedIssuer is the v2.0 issuer of the user\'s tenant', () => {
  assert.equal(expectedIssuer(TEST_TENANT_ID), `https://login.microsoftonline.com/${TEST_TENANT_ID}/v2.0`);
  assert.ok(isGuid(TEST_TENANT_ID));
  assert.ok(!isGuid('organizations'));
});

test('personal accounts are recognised by the consumer tenant ID', () => {
  assert.equal(PERSONAL_ACCOUNTS_TENANT_ID, PERSONAL_TENANT_ID);
  assert.ok(isPersonalAccountTenant(PERSONAL_TENANT_ID));
  assert.ok(isPersonalAccountTenant(PERSONAL_TENANT_ID.toUpperCase()));
  assert.ok(!isPersonalAccountTenant(TEST_TENANT_ID));
  assert.ok(!isPersonalAccountTenant('consumers'));
});

/** Asks Git itself, so the test follows the rules rather than their exact wording. */
function isGitIgnored(path: string): boolean {
  const result = spawnSync('git', ['check-ignore', '--quiet', '--no-index', path], { cwd: projectRoot });
  assert.ok(result.status === 0 || result.status === 1, `git check-ignore failed for ${path}: ${String(result.stderr)}`);
  return result.status === 0;
}

describe('no secrets in the app', () => {
  test('local env files and Android signing credentials are gitignored', () => {
    for (const path of ['.env.local', '.env', '.env.production', 'release.keystore', 'upload.jks', 'keystore.properties']) {
      assert.ok(isGitIgnored(path), path);
    }
  });

  test('the secret-free .env.example template stays tracked', () => {
    assert.ok(!isGitIgnored('.env.example'));
  });

  test('the example settings and the source contain no client secret', () => {
    const files = ['.env.example', 'src/auth/entra-config.ts', 'src/auth/token-client.ts', 'src/auth/auth-runtime.native.ts'];
    for (const file of files) {
      const text = readFileSync(resolve(projectRoot, file), 'utf8');
      assert.doesNotMatch(text, /client_secret\s*[:=]|clientSecret\s*[:=]|ENTRA_CLIENT_SECRET/i, file);
    }
  });
});

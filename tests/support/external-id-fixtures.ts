// Made-up Microsoft Entra External ID values for the auth tests. None is a
// real tenant, app or token. The issuer format is the one Microsoft
// documents for external tenants: the tenant ID in host and path.
import { NOW_MS, makeJwt } from './entra-fixtures';

export const EXTERNAL_CLIENT_ID = 'a1a1a1a1-2222-4333-8444-555555555555';
export const EXTERNAL_API_CLIENT_ID = 'c1c1c1c1-1111-4222-8333-444455556666';
export const EXTERNAL_API_SCOPE = `api://${EXTERNAL_API_CLIENT_ID}/access_as_user`;
export const EXTERNAL_TENANT_ID = 'e1e1e1e1-2222-4333-8444-555555555555';
export const EXTERNAL_SUBDOMAIN = 'roombookingtest';
export const EXTERNAL_ISSUER = `https://${EXTERNAL_TENANT_ID}.ciamlogin.com/${EXTERNAL_TENANT_ID}/v2.0`;
export const EXTERNAL_OBJECT_ID = '0b1d0b1d-90ab-4cde-8f01-234567890abc';

export const externalIdSettings = {
  clientId: EXTERNAL_CLIENT_ID,
  apiScope: EXTERNAL_API_SCOPE,
  tenantId: EXTERNAL_TENANT_ID,
  tenantSubdomain: EXTERNAL_SUBDOMAIN,
};

export function makeExternalIdToken(overrides: Record<string, unknown> = {}): string {
  return makeJwt({
    aud: EXTERNAL_CLIENT_ID,
    iss: EXTERNAL_ISSUER,
    tid: EXTERNAL_TENANT_ID,
    oid: EXTERNAL_OBJECT_ID,
    sub: 'external-pairwise-subject',
    name: 'Emma E-mail',
    email: 'emma@example.com',
    iat: NOW_MS / 1000 - 60,
    nbf: NOW_MS / 1000 - 60,
    exp: NOW_MS / 1000 + 3600,
    ver: '2.0',
    ...overrides,
  });
}

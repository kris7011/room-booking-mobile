// Made-up Entra values for the auth tests. None of them is a real tenant,
// app or token; the JWTs are not signed, since the app does not check
// signatures (the API does).
export const TEST_CLIENT_ID = '11111111-2222-4333-8444-555555555555';
export const TEST_API_CLIENT_ID = '99999999-8888-4777-8666-555555555555';
export const TEST_API_SCOPE = `api://${TEST_API_CLIENT_ID}/access_as_user`;
export const TEST_TENANT_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
export const OTHER_TENANT_ID = 'ffffffff-0000-4111-8222-333333333333';
export const TEST_OBJECT_ID = '12345678-90ab-4cde-8f01-234567890abc';
/** Microsoft's real consumer tenant, written out so a typo in the app's constant fails the tests. */
export const PERSONAL_TENANT_ID = '9188040d-6c67-4c5b-b112-36a304b66dad';
/** Personal accounts get object IDs of this shape. */
export const PERSONAL_OBJECT_ID = '00000000-0000-0000-4d2a-7b3c9e1f5a60';
export const TEST_REDIRECT_URI = 'roombookingdev://auth';
export const TEST_TOKEN_ENDPOINT = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';

/** A fixed "now" for the tests: 1 March 2031, 10:00 UTC. */
export const NOW_MS = Date.UTC(2031, 2, 1, 10, 0, 0);

export function base64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

/** header.payload.signature with a fake signature. */
export function makeJwt(payload: Record<string, unknown>): string {
  return `${base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'test' }))}.${base64Url(JSON.stringify(payload))}.c2lnbmF0dXJl`;
}

export function idTokenClaims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    aud: TEST_CLIENT_ID,
    iss: `https://login.microsoftonline.com/${TEST_TENANT_ID}/v2.0`,
    tid: TEST_TENANT_ID,
    oid: TEST_OBJECT_ID,
    sub: 'pairwise-subject',
    name: 'Søren Ærø-Ågård',
    preferred_username: 'soren@contoso.example',
    iat: NOW_MS / 1000 - 60,
    nbf: NOW_MS / 1000 - 60,
    exp: NOW_MS / 1000 + 3600,
    ver: '2.0',
    ...overrides,
  };
}

export function makeIdToken(overrides: Record<string, unknown> = {}): string {
  return makeJwt(idTokenClaims(overrides));
}

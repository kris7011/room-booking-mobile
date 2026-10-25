// Microsoft Entra ID settings for the mobile app, a public client: it signs
// in with the authorization code flow and PKCE and never has a client
// secret. Everything here ends up in the app bundle and may be seen by
// anyone, which is fine for these values: a client ID, an API scope and a
// tenant are identifiers, not credentials.
//
// EXPO_PUBLIC_ variables are inlined at bundle time and only when read with
// static dot notation, so they are read below and nowhere else.
//
// Platform-independent on purpose, so it runs in the Node tests.

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ENTRA_INSTANCE = 'https://login.microsoftonline.com';

/**
 * "common" signs in both personal Microsoft accounts (Outlook.com, Hotmail,
 * Live.com) and work or school accounts of any tenant.
 */
export const DEFAULT_ENTRA_TENANT = 'common';

/**
 * The tenant personal Microsoft accounts sign in through: their tokens carry
 * it as `tid` and in `iss`, like any other tenant.
 */
export const PERSONAL_ACCOUNTS_TENANT_ID = '9188040d-6c67-4c5b-b112-36a304b66dad';

/** The values as they come from the environment, before any validation. */
export interface RawEntraSettings {
  clientId?: string;
  apiScope?: string;
  tenant?: string;
}

export interface EntraConfig {
  /** Application (client) ID of the mobile app registration. */
  clientId: string;
  /** Delegated scope of the API registration, e.g. api://<api-id>/access_as_user. */
  apiScope: string;
  /** "common" (the default), "organizations", a tenant ID or a verified domain. */
  tenant: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  /** openid and profile for the ID token, offline_access for a refresh token, then the API. */
  scopes: string[];
  /**
   * The only tenant whose users are accepted, when `tenant` is a tenant ID.
   * Null for organizations, common or a domain name.
   */
  requiredTenantId: string | null;
}

export type EntraConfigResult =
  | { configured: true; config: EntraConfig }
  /** `problem` is null when nothing is set: the app then simply runs without login. */
  | { configured: false; problem: string | null };

export function resolveEntraConfig(raw: RawEntraSettings): EntraConfigResult {
  const clientId = raw.clientId?.trim() ?? '';
  const apiScope = raw.apiScope?.trim() ?? '';
  const tenant = raw.tenant?.trim() || DEFAULT_ENTRA_TENANT;

  if (!clientId && !apiScope) return { configured: false, problem: null };
  if (!clientId) return { configured: false, problem: 'EXPO_PUBLIC_ENTRA_CLIENT_ID mangler.' };
  if (!apiScope) return { configured: false, problem: 'EXPO_PUBLIC_ENTRA_API_SCOPE mangler.' };

  if (!GUID.test(clientId)) {
    return {
      configured: false,
      problem: 'EXPO_PUBLIC_ENTRA_CLIENT_ID skal være mobilappens Application (client) ID (et GUID).',
    };
  }
  const scopeProblem = checkApiScope(apiScope, clientId);
  if (scopeProblem) return { configured: false, problem: scopeProblem };

  // The tenant ends up in a URL, so it must be one plain path segment.
  // "consumers" (personal accounts only) would shut out every work and
  // school account; "common" already includes personal accounts.
  if (!/^[A-Za-z0-9][A-Za-z0-9.-]*$/.test(tenant) || tenant.toLowerCase() === 'consumers') {
    return {
      configured: false,
      problem: 'EXPO_PUBLIC_ENTRA_TENANT skal være "common", "organizations", et tenant-ID eller et domæne.',
    };
  }

  return {
    configured: true,
    config: {
      clientId,
      apiScope,
      tenant,
      authorizationEndpoint: `${ENTRA_INSTANCE}/${tenant}/oauth2/v2.0/authorize`,
      tokenEndpoint: `${ENTRA_INSTANCE}/${tenant}/oauth2/v2.0/token`,
      scopes: ['openid', 'profile', 'offline_access', apiScope],
      requiredTenantId: GUID.test(tenant) ? tenant.toLowerCase() : null,
    },
  };
}

function checkApiScope(apiScope: string, clientId: string): string | null {
  // api://<application ID URI>/<scope name>, or <API client ID>/<scope name>.
  const match = /^(api:\/\/\S+|[0-9a-f-]{36})\/([A-Za-z0-9._-]+)$/i.exec(apiScope);
  if (!match) {
    return "EXPO_PUBLIC_ENTRA_API_SCOPE skal være API'ets fulde scope, fx api://<API'ets client ID>/access_as_user.";
  }
  // A scope of the mobile app's own registration gives a token whose
  // audience is the app, which the API must reject.
  if (match[1].toLowerCase().includes(clientId.toLowerCase())) {
    return "EXPO_PUBLIC_ENTRA_API_SCOPE peger på mobilappens egen registrering. Brug scopet fra API'ets registrering.";
  }
  return null;
}

export const entraConfigResult: EntraConfigResult = resolveEntraConfig({
  clientId: process.env.EXPO_PUBLIC_ENTRA_CLIENT_ID,
  apiScope: process.env.EXPO_PUBLIC_ENTRA_API_SCOPE,
  tenant: process.env.EXPO_PUBLIC_ENTRA_TENANT,
});

const resolved = entraConfigResult.configured ? entraConfigResult.config : null;

export const ENTRA_CLIENT_ID = resolved?.clientId ?? '';
export const ENTRA_API_SCOPE = resolved?.apiScope ?? '';
export const ENTRA_TENANT = resolved?.tenant ?? DEFAULT_ENTRA_TENANT;
/**
 * Base URL of the Entra endpoints. Not the `iss` of a token: with "common"
 * that is https://login.microsoftonline.com/<the user's tenant ID>/v2.0
 * (PERSONAL_ACCOUNTS_TENANT_ID for a personal account), see expectedIssuer().
 */
export const ENTRA_AUTHORITY = `${ENTRA_INSTANCE}/${ENTRA_TENANT}/v2.0`;
export const ENTRA_SCOPES: readonly string[] = resolved?.scopes ?? [];

/** True when a client ID and a valid API scope are set. */
export function isEntraConfigured(): boolean {
  return entraConfigResult.configured;
}

/** Whether `value` is a GUID, the format of Entra tenant and object IDs. */
export function isGuid(value: unknown): value is string {
  return typeof value === 'string' && GUID.test(value);
}

/** The `iss` Entra puts in a v2.0 token for a user of `tenantId`. */
export function expectedIssuer(tenantId: string): string {
  return `${ENTRA_INSTANCE}/${tenantId}/v2.0`;
}

/**
 * Which Microsoft accounts the login page of `tenant` accepts, for the
 * development log. On "common" the authority alone does not decide it:
 * Microsoft also refuses personal accounts, with the same message as on
 * "organizations", when the mobile app's registration or the registration
 * of a requested scope's API does not allow them.
 */
export function describeAccountTypes(tenant: string): string {
  switch (tenant.toLowerCase()) {
    case 'common':
      return 'work or school accounts, and personal Microsoft accounts if the mobile and the API registration both allow them';
    case 'organizations':
      return 'work or school accounts only; Microsoft refuses personal accounts here';
    default:
      return `work or school accounts of ${tenant} only; Microsoft refuses personal accounts here`;
  }
}

/** Whether a user of `tenantId` signed in with a personal Microsoft account. */
export function isPersonalAccountTenant(tenantId: string): boolean {
  return tenantId.toLowerCase() === PERSONAL_ACCOUNTS_TENANT_ID;
}

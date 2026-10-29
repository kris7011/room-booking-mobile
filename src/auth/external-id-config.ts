// Microsoft Entra External ID settings for e-mail sign-in with a one-time
// code. The external tenant is a separate directory with its own app
// registrations, so it has its own client ID and API scope. Like the Entra
// settings, these are identifiers, not credentials, and end up in the
// bundle.
//
// EXPO_PUBLIC_ variables are inlined at bundle time and only when read with
// static dot notation, so they are read below and nowhere else.
//
// Platform-independent on purpose, so it runs in the Node tests.
import { checkApiScope, isGuid } from './entra-config';

/** The values as they come from the environment, before any validation. */
export interface RawExternalIdSettings {
  clientId?: string;
  apiScope?: string;
  tenantId?: string;
  tenantSubdomain?: string;
}

export interface ExternalIdConfig {
  /** Application (client) ID of the mobile app's registration in the external tenant. */
  clientId: string;
  /** Delegated scope of the API's registration there, e.g. api://<api-id>/access_as_user. */
  apiScope: string;
  tenantId: string;
  /** "contoso" for contoso.onmicrosoft.com; sign-in runs on contoso.ciamlogin.com. */
  tenantSubdomain: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  scopes: string[];
  /**
   * The `iss` of the tenant's tokens. Microsoft documents it as the tenant
   * ID in both the host and the path, not the subdomain.
   */
  issuer: string;
}

export type ExternalIdConfigResult =
  | { configured: true; config: ExternalIdConfig }
  /** `problem` is null when nothing is set: e-mail sign-in is then simply not offered. */
  | { configured: false; problem: string | null };

const SUBDOMAIN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

export function resolveExternalIdConfig(raw: RawExternalIdSettings): ExternalIdConfigResult {
  const clientId = raw.clientId?.trim() ?? '';
  const apiScope = raw.apiScope?.trim() ?? '';
  const tenantId = raw.tenantId?.trim().toLowerCase() ?? '';
  const tenantSubdomain = raw.tenantSubdomain?.trim().toLowerCase() ?? '';

  if (!clientId && !apiScope && !tenantId && !tenantSubdomain) return { configured: false, problem: null };
  if (!isGuid(clientId)) {
    return {
      configured: false,
      problem: 'EXPO_PUBLIC_EXTERNAL_ID_CLIENT_ID skal være mobilappens Application (client) ID i External ID-tenanten.',
    };
  }
  if (!isGuid(tenantId)) {
    return { configured: false, problem: 'EXPO_PUBLIC_EXTERNAL_ID_TENANT_ID skal være External ID-tenantens ID (et GUID).' };
  }
  if (!SUBDOMAIN.test(tenantSubdomain)) {
    return {
      configured: false,
      problem: 'EXPO_PUBLIC_EXTERNAL_ID_TENANT_SUBDOMAIN skal være tenantens underdomæne, fx contoso for contoso.onmicrosoft.com.',
    };
  }
  if (!apiScope) return { configured: false, problem: 'EXPO_PUBLIC_EXTERNAL_ID_API_SCOPE mangler.' };
  const scopeProblem = checkApiScope(apiScope, clientId, 'EXPO_PUBLIC_EXTERNAL_ID_API_SCOPE');
  if (scopeProblem) return { configured: false, problem: scopeProblem };

  const authority = `https://${tenantSubdomain}.ciamlogin.com/${tenantId}`;
  return {
    configured: true,
    config: {
      clientId,
      apiScope,
      tenantId,
      tenantSubdomain,
      authorizationEndpoint: `${authority}/oauth2/v2.0/authorize`,
      tokenEndpoint: `${authority}/oauth2/v2.0/token`,
      scopes: ['openid', 'profile', 'offline_access', apiScope],
      issuer: `https://${tenantId}.ciamlogin.com/${tenantId}/v2.0`,
    },
  };
}

export const externalIdConfigResult: ExternalIdConfigResult = resolveExternalIdConfig({
  clientId: process.env.EXPO_PUBLIC_EXTERNAL_ID_CLIENT_ID,
  apiScope: process.env.EXPO_PUBLIC_EXTERNAL_ID_API_SCOPE,
  tenantId: process.env.EXPO_PUBLIC_EXTERNAL_ID_TENANT_ID,
  tenantSubdomain: process.env.EXPO_PUBLIC_EXTERNAL_ID_TENANT_SUBDOMAIN,
});

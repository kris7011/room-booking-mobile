import type { ClaimedIdentityLink, LinkedIdentity, StartedIdentityLink } from '../models/identity-link';
import { requestJson, type AccessGrant } from './http-client';

/** The identity-linking endpoints. Start, confirm and cancel use the session; claim uses the new identity. */
export interface IdentityLinksApi {
  start(): Promise<StartedIdentityLink>;
  /** Sent with the second identity's token, never the session's. */
  claim(code: string, secondIdentity: AccessGrant): Promise<ClaimedIdentityLink>;
  confirm(linkId: string): Promise<LinkedIdentity[]>;
  cancel(linkId: string): Promise<void>;
  listIdentities(): Promise<LinkedIdentity[]>;
}

export const identityLinksApi: IdentityLinksApi = {
  start: () => requestJson<StartedIdentityLink>('/api/me/identity-links', { method: 'POST' }),
  claim: (code, secondIdentity) =>
    requestJson<ClaimedIdentityLink>('/api/identity-links/claim', { method: 'POST', body: { code }, grant: secondIdentity }),
  confirm: (linkId) => requestJson<LinkedIdentity[]>(`/api/me/identity-links/${encodeURIComponent(linkId)}/confirm`, { method: 'POST' }),
  cancel: async (linkId) => {
    await requestJson<void>(`/api/me/identity-links/${encodeURIComponent(linkId)}`, { method: 'DELETE' });
  },
  listIdentities: () => requestJson<LinkedIdentity[]>('/api/me/identities'),
};

// Shapes of the API's identity-linking endpoints (backend ADR 0009).

/** POST /api/me/identity-links. The code is shown only in this response. */
export interface StartedIdentityLink {
  linkId: string;
  code: string;
  expiresUtc: string;
}

/** POST /api/identity-links/claim: the account the new identity will join. */
export interface ClaimedIdentityLink {
  linkId: string;
  accountDisplayName: string;
  provider: 'Entra' | 'ExternalId';
  expiresUtc: string;
}

/** One way the user signs in (GET /api/me/identities, and the answer to a confirmation). */
export interface LinkedIdentity {
  provider: 'Entra' | 'ExternalId';
  isPersonalMicrosoftAccount: boolean;
  verifiedEmail: string | null;
  createdUtc: string;
  lastUsedUtc: string | null;
  isCurrent: boolean;
}

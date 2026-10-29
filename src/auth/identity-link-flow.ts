// Linking a second sign-in identity to the signed-in user, step by step, as
// the API requires (backend ADR 0009): start with the session, sign in with
// the identity to add and claim the code with its token, then let the user
// confirm with both identities in view. Nothing is linked before that
// confirmation, and never because e-mail addresses match.
//
// No React and no Expo imports, so the whole flow runs in the Node tests.
import { ApiError, type AccessGrant } from '../api/http-client';
import type { IdentityLinksApi } from '../api/identity-links-api';
import type { LinkedIdentity } from '../models/identity-link';
import { isAuthFlowError } from './auth-errors';
import type { AuthProviderId, AuthUser } from './id-token';

export type IdentityLinkState =
  | { step: 'idle'; notice?: { kind: 'info' | 'error'; message: string } }
  | { step: 'working'; message: string }
  /** Both identities proven; waiting for the user's yes or no. */
  | { step: 'confirm'; linkId: string; accountName: string; newIdentity: AuthUser }
  | { step: 'done'; identities: LinkedIdentity[] };

export interface IdentityLinkDeps {
  api: IdentityLinksApi;
  /** AuthController.proveIdentity: a sign-in that leaves the session alone. */
  proveIdentity(provider: AuthProviderId): Promise<{ user: AuthUser; grant: AccessGrant }>;
  /** Fallback text for errors without a linking-specific message (error-messages.ts). */
  describeError(error: unknown): string;
}

/** The API's linking problem codes, in Danish. */
const LINK_MESSAGES: Readonly<Record<string, string>> = {
  identity_belongs_to_another_user:
    'Det login er allerede en selvstændig Room Booking-konto. Konti lægges aldrig sammen, så det kan ikke tilknyttes.',
  identity_already_linked: 'Det login hører allerede til din konto.',
  identity_link_invalid: 'Tilknytningen er udløbet eller ikke længere gyldig. Start forfra.',
  identity_link_not_claimed: 'Log ind med det login, du vil tilknytte, før du bekræfter.',
  identity_link_not_found: 'Tilknytningen findes ikke længere. Start forfra.',
};

export class IdentityLinkFlow {
  private state: IdentityLinkState = { step: 'idle' };
  private readonly listeners = new Set<(state: IdentityLinkState) => void>();

  constructor(private readonly deps: IdentityLinkDeps) {}

  getState = (): IdentityLinkState => this.state;

  subscribe = (listener: (state: IdentityLinkState) => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /**
   * Starts a link and signs in with `provider` to prove the new identity.
   * Ends in 'confirm', or back in 'idle' with a notice. The second
   * identity's token is used for the claim only and then dropped.
   */
  async begin(provider: AuthProviderId): Promise<void> {
    if (this.state.step === 'working' || this.state.step === 'confirm') return;
    let linkId: string | null = null;

    try {
      this.set({ step: 'working', message: 'Forbereder tilknytning…' });
      const started = await this.deps.api.start();
      linkId = started.linkId;

      this.set({ step: 'working', message: 'Log ind med det login, du vil tilknytte…' });
      const proof = await this.deps.proveIdentity(provider);

      this.set({ step: 'working', message: 'Kontrollerer det nye login…' });
      const claimed = await this.deps.api.claim(started.code, proof.grant);

      this.set({ step: 'confirm', linkId: claimed.linkId, accountName: claimed.accountDisplayName, newIdentity: proof.user });
    } catch (error) {
      // Nothing was linked; the open request is withdrawn (best effort, it also expires).
      if (linkId) await this.deps.api.cancel(linkId).catch(() => undefined);
      this.set({ step: 'idle', notice: this.notice(error) });
    }
  }

  /** The user's yes: only now does the API link the identity. */
  async confirm(): Promise<void> {
    if (this.state.step !== 'confirm') return;
    const { linkId } = this.state;
    this.set({ step: 'working', message: 'Tilknytter…' });
    try {
      this.set({ step: 'done', identities: await this.deps.api.confirm(linkId) });
    } catch (error) {
      this.set({ step: 'idle', notice: this.notice(error) });
    }
  }

  /** The user's no: the request is withdrawn and nothing is linked. */
  async decline(): Promise<void> {
    if (this.state.step !== 'confirm') return;
    const { linkId } = this.state;
    this.set({ step: 'idle', notice: { kind: 'info', message: 'Intet blev tilknyttet.' } });
    await this.deps.api.cancel(linkId).catch(() => undefined);
  }

  /** Back to the start after a finished link. */
  reset(): void {
    if (this.state.step === 'done' || this.state.step === 'idle') this.set({ step: 'idle' });
  }

  private notice(error: unknown): { kind: 'info' | 'error'; message: string } {
    if (isAuthFlowError(error, 'cancelled')) return { kind: 'info', message: 'Login blev afbrudt. Intet blev tilknyttet.' };
    const code = error instanceof ApiError ? error.problem?.code : undefined;
    return { kind: 'error', message: (code && LINK_MESSAGES[code]) || this.deps.describeError(error) };
  }

  private set(state: IdentityLinkState): void {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }
}

/** How a linked identity is shown, e.g. "Microsoft-konto (personlig)". */
export function describeLinkedIdentity(identity: LinkedIdentity): string {
  const kind =
    identity.provider === 'ExternalId'
      ? 'E-mail-kode'
      : identity.isPersonalMicrosoftAccount
        ? 'Microsoft-konto (personlig)'
        : 'Microsoft arbejds- eller skolekonto';
  const email = identity.verifiedEmail ? ` – ${identity.verifiedEmail}` : '';
  return `${kind}${email}${identity.isCurrent ? ' (du er logget ind med denne)' : ''}`;
}

export const LINK_LABELS: Readonly<Record<AuthProviderId, string>> = {
  entra: 'Tilknyt en Microsoft-konto',
  'external-id': 'Tilknyt login med e-mail-kode',
};

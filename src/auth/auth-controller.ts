// The app's login state and the only place that holds tokens. Screens read
// `state` (which never contains a token) and call signIn/signOut; the HTTP
// client asks getAccessGrant() for every request to the API.
//
// No React and no Expo imports: the browser login, the token endpoint and
// the secure storage are passed in, so the whole flow runs in the Node tests.
import type { AccessGrant, AccessTokenProvider } from '../api/http-client';
import { AuthFlowError, describeAuthError, isAuthFlowError } from './auth-errors';
import { AUTH_PROVIDER_IDS, type AuthProviderId, type AuthUser } from './id-token';
import { clearSession, loadSession, saveSession, type KeyValueStore } from './session-storage';
import type { TokenSet } from './token-client';

/** Renew the access token this long before it expires, so it never expires in flight. */
export const ACCESS_TOKEN_RENEWAL_MARGIN_MS = 2 * 60 * 1000;

export type AuthUnavailableReason = 'not-configured' | 'invalid-config' | 'web' | 'expo-go';

export type AuthState =
  /** Login cannot be used here; the app works without it (demo or anonymous API). */
  | { status: 'unavailable'; reason: AuthUnavailableReason; detail?: string }
  | { status: 'restoring' }
  /** `notice`: why the user is signed out, e.g. an expired session or a failed login. */
  | { status: 'signed-out'; notice?: AuthNotice }
  | { status: 'signing-in' }
  /** `warning`: signed in, but something needs attention (offline, not saved). */
  | { status: 'signed-in'; user: AuthUser; warning?: string };

export interface AuthNotice {
  kind: 'info' | 'error';
  message: string;
}

/** Result of the interactive part: the browser login and redirect back to the app. */
export type AuthorizeResult = { type: 'success'; code: string; codeVerifier: string } | { type: 'cancel' };

/** One way to sign in: its browser login, its token endpoint and its ID-token rules. */
export interface AuthProviderClient {
  /** Opens the provider's login page and returns the authorization code. Throws AuthFlowError. */
  authorize(): Promise<AuthorizeResult>;
  redeemCode(code: string, codeVerifier: string): Promise<TokenSet>;
  refresh(refreshToken: string): Promise<TokenSet>;
  /** Validates the ID token's claims (see id-token.ts). Throws AuthFlowError. */
  readUser(idToken: string | undefined): AuthUser;
}

export interface AuthControllerDeps {
  store: KeyValueStore;
  /** Microsoft sign-in always; e-mail one-time code (External ID) only when configured. */
  providers: { entra: AuthProviderClient } & Partial<Record<AuthProviderId, AuthProviderClient>>;
  now?: () => number;
}

interface LiveSession {
  user: AuthUser;
  refreshToken?: string;
  accessToken?: string;
  accessTokenExpiresAt: number;
}

type Listener = (state: AuthState) => void;

export class AuthController implements AccessTokenProvider {
  private state: AuthState;
  private readonly listeners = new Set<Listener>();
  private session: LiveSession | null = null;
  /** The running renewal and the session generation it belongs to. */
  private refreshInFlight: { generation: number; promise: Promise<string | null> } | null = null;
  private started = false;
  /**
   * Bumped by every sign-in and sign-out. Async work started under an older
   * generation must not change the session or the storage when it finishes.
   */
  private generation = 0;
  /** The generation whose session a renewal found expired or revoked. */
  private expiredGeneration = -1;
  /** SecureStore reads and writes run one after another, in the order they were requested. */
  private storageQueue: Promise<void> = Promise.resolve();

  private constructor(
    private readonly deps: AuthControllerDeps | null,
    initial: AuthState,
  ) {
    this.state = initial;
  }

  static create(deps: AuthControllerDeps): AuthController {
    return new AuthController(deps, { status: 'restoring' });
  }

  static unavailable(reason: AuthUnavailableReason, detail?: string): AuthController {
    return new AuthController(null, { status: 'unavailable', reason, detail });
  }

  getState = (): AuthState => this.state;

  /** The ways to sign in on this device, Microsoft first. Empty when login is unavailable. */
  getProviders = (): readonly AuthProviderId[] =>
    this.deps ? AUTH_PROVIDER_IDS.filter((provider) => this.deps?.providers[provider] !== undefined) : [];

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Restores a stored session once. Safe to call more than once. */
  async start(): Promise<void> {
    if (!this.deps || this.started) return;
    this.started = true;
    const generation = this.generation;

    let stored;
    try {
      // Through the queue, so a logout's delete can never run while this reads.
      const store = this.deps.store;
      stored = await this.enqueueStorage(() => loadSession(store));
    } catch (error) {
      if (generation === this.generation) this.setState({ status: 'signed-out', notice: errorNotice(error) });
      return;
    }
    // A sign-in that started while restoring wins.
    if (generation !== this.generation) return;
    if (!stored) {
      this.setState({ status: 'signed-out' });
      return;
    }
    // Saved by a build that offered e-mail sign-in, which this one does not:
    // nobody could renew it.
    if (!this.deps.providers[stored.user.provider]) {
      this.setState({
        status: 'signed-out',
        notice: { kind: 'info', message: 'Login med e-mail-kode er ikke sat op i denne udgave af appen. Log ind igen.' },
      });
      await this.enqueueStorage(() => clearSession(this.requireDeps().store)).catch(() => undefined);
      return;
    }

    this.session = { user: stored.user, refreshToken: stored.refreshToken, accessTokenExpiresAt: 0 };
    this.setState({ status: 'signed-in', user: stored.user });
    // Check the session with Microsoft right away instead of at the first
    // API call, so an expired or revoked session shows up as signed out.
    // getAccessToken updates the state itself.
    await this.getAccessToken().catch(() => undefined);
  }

  /**
   * Opens the login page of `provider` (Microsoft unless the user chose an
   * e-mail code). Does nothing while a login is open or someone is signed
   * in: another account signs in after signOut(). Otherwise a cancelled or
   * failed second login would show "signed out" while the first session
   * still handed out tokens and stayed stored.
   */
  async signIn(provider: AuthProviderId = 'entra'): Promise<void> {
    const client = this.deps?.providers[provider];
    if (!client || this.state.status === 'signing-in' || this.state.status === 'signed-in') return;
    const generation = ++this.generation;
    this.setState({ status: 'signing-in' });

    try {
      const result = await client.authorize();
      if (generation !== this.generation) return;
      if (result.type === 'cancel') {
        this.setState({ status: 'signed-out', notice: { kind: 'info', message: describeAuthError(new AuthFlowError('cancelled', 'cancelled')) } });
        return;
      }

      const tokens = await client.redeemCode(result.code, result.codeVerifier);
      const user = client.readUser(tokens.idToken);
      if (user.provider !== provider) throw new AuthFlowError('invalid-response', 'ID token of another provider');
      if (generation !== this.generation) return;

      this.session = {
        user,
        refreshToken: tokens.refreshToken,
        accessToken: tokens.accessToken,
        accessTokenExpiresAt: tokens.accessTokenExpiresAt,
      };
      this.setState({ status: 'signed-in', user });

      // Without offline_access there is no refresh token and nothing to keep.
      const warning = tokens.refreshToken
        ? await this.persist(generation, { refreshToken: tokens.refreshToken, user })
        : 'Microsoft gav ingen refresh token, så du skal logge ind igen, når appen genstartes.';
      if (warning && generation === this.generation) this.setState({ status: 'signed-in', user, warning });
    } catch (error) {
      if (generation !== this.generation) return;
      this.session = null;
      this.setState({ status: 'signed-out', notice: errorNotice(error) });
    }
  }

  /**
   * Signs in with `provider` once more, only to prove control of a second
   * identity for linking it (identity-link-flow.ts). The session stays as it
   * is: nothing is stored, the state does not change, and the second
   * identity's refresh token is dropped. The grant is valid only while the
   * session that asked for it lasts. Throws AuthFlowError: 'cancelled' when
   * the user closes the page, 'session-changed' when the session ended
   * meanwhile.
   */
  async proveIdentity(provider: AuthProviderId): Promise<{ user: AuthUser; grant: AccessGrant }> {
    const client = this.deps?.providers[provider];
    if (!client || this.state.status !== 'signed-in') throw new AuthFlowError('session-changed', 'Nobody is signed in');
    const generation = this.generation;
    const ended = () => generation !== this.generation;

    const result = await client.authorize();
    if (ended()) throw sessionChanged();
    if (result.type === 'cancel') throw new AuthFlowError('cancelled', 'cancelled');

    const tokens = await client.redeemCode(result.code, result.codeVerifier);
    const user = client.readUser(tokens.idToken);
    if (user.provider !== provider) throw new AuthFlowError('invalid-response', 'ID token of another provider');
    if (ended()) throw sessionChanged();

    return { user, grant: { accessToken: tokens.accessToken, isCurrent: () => !ended() } };
  }

  /**
   * Ends the session on this device: forgets the tokens and deletes the
   * stored refresh token. The Microsoft session in the browser is kept;
   * the next login offers an account picker (prompt=select_account).
   */
  async signOut(): Promise<void> {
    if (!this.deps) return;
    const generation = ++this.generation;
    this.session = null;
    this.refreshInFlight = null;
    this.setState({ status: 'signed-out', notice: { kind: 'info', message: 'Du er logget ud.' } });
    try {
      await this.enqueueStorage(() => clearSession(this.requireDeps().store));
    } catch {
      // Only while still signed out: a login that finished in the meantime
      // must not be replaced by this logout's late failure.
      if (generation !== this.generation) return;
      this.setState({
        status: 'signed-out',
        notice: { kind: 'error', message: 'Du er logget ud, men den gemte session kunne ikke slettes fra enheden.' },
      });
    }
  }

  /**
   * The access token for a request, bound to the session that is current
   * when the request asks, or null when nobody is signed in (the request is
   * then anonymous, as without login).
   *
   * Renews the token when it is about to expire; concurrent callers share
   * one renewal. A request never changes identity while it waits: if the
   * user signs out, or out and in as someone else, before the renewal is
   * done, this throws AuthFlowError('session-changed') and the request is
   * not sent, neither as the new user nor anonymously. It also throws when
   * the token cannot be renewed (offline, or the session has expired).
   *
   * `isCurrent()` lets the HTTP client check, right before sending, that the
   * session has not ended in the meantime.
   */
  async getAccessGrant(options: { forceRefresh?: boolean } = {}): Promise<AccessGrant | null> {
    const session = this.session;
    if (!this.deps || !session) return null;
    const generation = this.generation;
    const grant = (accessToken: string): AccessGrant => ({
      accessToken,
      isCurrent: () => this.generation === generation,
    });

    if (!options.forceRefresh && session.accessToken && session.accessTokenExpiresAt - this.now() > ACCESS_TOKEN_RENEWAL_MARGIN_MS) {
      return grant(session.accessToken);
    }

    let accessToken: string | null;
    try {
      accessToken = await this.renewal(generation, session);
    } catch (error) {
      // The renewal itself found the session expired or revoked: say so.
      if (generation === this.generation || generation === this.expiredGeneration) throw error;
      throw sessionChanged();
    }
    // renew() returns null only when the session ended while it ran.
    if (accessToken === null || generation !== this.generation) throw sessionChanged();
    return grant(accessToken);
  }

  /** The token alone, for callers that send nothing (see getAccessGrant). */
  async getAccessToken(options: { forceRefresh?: boolean } = {}): Promise<string | null> {
    return (await this.getAccessGrant(options))?.accessToken ?? null;
  }

  /** The running renewal of this session, or a new one. Never shared across sessions. */
  private renewal(generation: number, session: LiveSession): Promise<string | null> {
    if (this.refreshInFlight?.generation !== generation) {
      const promise: Promise<string | null> = this.renew(generation, session).finally(() => {
        if (this.refreshInFlight?.promise === promise) this.refreshInFlight = null;
      });
      this.refreshInFlight = { generation, promise };
    }
    return this.refreshInFlight.promise;
  }

  private async renew(generation: number, session: LiveSession): Promise<string | null> {
    const client = this.requireDeps().providers[session.user.provider];

    if (!session.refreshToken || !client) {
      this.expire(generation);
      throw new AuthFlowError('session-expired', 'No refresh token');
    }

    let tokens: TokenSet;
    let user = session.user;
    try {
      tokens = await client.refresh(session.refreshToken);
      if (tokens.idToken) user = client.readUser(tokens.idToken);
      // A renewal never changes who is signed in.
      if (user.provider !== session.user.provider || user.objectId !== session.user.objectId || user.tenantId !== session.user.tenantId) {
        throw new AuthFlowError('session-expired', 'The renewed tokens belong to another user');
      }
    } catch (error) {
      if (generation !== this.generation) throw error;
      if (isAuthFlowError(error, 'session-expired') || isAuthFlowError(error, 'access-denied')) {
        this.expire(generation, error);
      } else if (this.state.status === 'signed-in') {
        // Offline or Microsoft unavailable: keep the session and try again on the next call.
        this.setState({ status: 'signed-in', user: session.user, warning: describeAuthError(error) });
      }
      throw error;
    }

    // Signed out while renewing: the request goes ahead without a token.
    if (generation !== this.generation) return null;

    const refreshToken = tokens.refreshToken ?? session.refreshToken;
    this.session = { user, refreshToken, accessToken: tokens.accessToken, accessTokenExpiresAt: tokens.accessTokenExpiresAt };
    this.setState({ status: 'signed-in', user });

    // Entra rotates refresh tokens; keep the newest so the next app start works.
    if (refreshToken !== session.refreshToken || user !== session.user) {
      const warning = await this.persist(generation, { refreshToken, user });
      // Signed out while saving (SecureStore is asynchronous): this token
      // belongs to an ended session and must not reach a request.
      if (generation !== this.generation) return null;
      if (warning) this.setState({ status: 'signed-in', user, warning });
    }
    return tokens.accessToken;
  }

  /** The session can no longer be renewed: sign out and delete it. */
  private expire(generation: number, error?: unknown): void {
    if (generation !== this.generation) return;
    this.expiredGeneration = generation;
    ++this.generation;
    this.session = null;
    this.setState({
      status: 'signed-out',
      notice: errorNotice(error ?? new AuthFlowError('session-expired', 'expired')),
    });
    void this.enqueueStorage(() => clearSession(this.requireDeps().store)).catch(() => undefined);
  }

  /** Saves the session unless the user signed out meanwhile. Returns a warning on failure. */
  private async persist(generation: number, session: { refreshToken: string; user: AuthUser }): Promise<string | undefined> {
    try {
      await this.enqueueStorage(async () => {
        if (generation === this.generation) await saveSession(this.requireDeps().store, session);
      });
      return undefined;
    } catch {
      return 'Sessionen kunne ikke gemmes sikkert på enheden, så du skal logge ind igen, når appen genstartes.';
    }
  }

  /** Reads and writes of SecureStore run one after another, in the order they were requested. */
  private enqueueStorage<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.storageQueue.then(operation);
    this.storageQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private requireDeps(): AuthControllerDeps {
    if (!this.deps) throw new Error('Login is not available');
    return this.deps;
  }

  private now(): number {
    return (this.deps?.now ?? Date.now)();
  }

  private setState(state: AuthState): void {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }
}

function sessionChanged(): AuthFlowError {
  return new AuthFlowError('session-changed', 'The session ended while the request waited for its token');
}

function errorNotice(error: unknown): AuthNotice {
  return { kind: isAuthFlowError(error, 'cancelled') ? 'info' : 'error', message: describeAuthError(error) };
}

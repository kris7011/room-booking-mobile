// The app's login state and the only place that holds tokens. Screens read
// `state` (which never contains a token) and call signIn/signOut; the HTTP
// client asks getAccessToken() for every request to the API.
//
// No React and no Expo imports: the browser login, the token endpoint and
// the secure storage are passed in, so the whole flow runs in the Node tests.
import { AuthFlowError, describeAuthError, isAuthFlowError } from './auth-errors';
import type { AuthUser } from './id-token';
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

export interface AuthControllerDeps {
  store: KeyValueStore;
  /** Opens the Microsoft login and returns the authorization code. Throws AuthFlowError. */
  authorize(): Promise<AuthorizeResult>;
  redeemCode(code: string, codeVerifier: string): Promise<TokenSet>;
  refresh(refreshToken: string): Promise<TokenSet>;
  /** Validates the ID token's claims (see id-token.ts). Throws AuthFlowError. */
  readUser(idToken: string | undefined): AuthUser;
  now?: () => number;
}

interface LiveSession {
  user: AuthUser;
  refreshToken?: string;
  accessToken?: string;
  accessTokenExpiresAt: number;
}

type Listener = (state: AuthState) => void;

export class AuthController {
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

    this.session = { user: stored.user, refreshToken: stored.refreshToken, accessTokenExpiresAt: 0 };
    this.setState({ status: 'signed-in', user: stored.user });
    // Check the session with Microsoft right away instead of at the first
    // API call, so an expired or revoked session shows up as signed out.
    // getAccessToken updates the state itself.
    await this.getAccessToken().catch(() => undefined);
  }

  async signIn(): Promise<void> {
    const deps = this.deps;
    if (!deps || this.state.status === 'signing-in') return;
    const generation = ++this.generation;
    this.setState({ status: 'signing-in' });

    try {
      const result = await deps.authorize();
      if (generation !== this.generation) return;
      if (result.type === 'cancel') {
        this.setState({ status: 'signed-out', notice: { kind: 'info', message: describeAuthError(new AuthFlowError('cancelled', 'cancelled')) } });
        return;
      }

      const tokens = await deps.redeemCode(result.code, result.codeVerifier);
      const user = deps.readUser(tokens.idToken);
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
   * A valid access token for the API, or null when nobody is signed in.
   * Renews it when it is about to expire; concurrent callers share one
   * renewal. Throws AuthFlowError when a signed-in user's token cannot be
   * renewed (offline, or the session has expired and the user is now
   * signed out).
   *
   * The token returned always belongs to the session that is current when
   * this method returns: if the user signs out (or out and in again) while
   * a renewal is running, its result is thrown away and the current state
   * decides (no token, or the new session's).
   */
  async getAccessToken(options: { forceRefresh?: boolean } = {}): Promise<string | null> {
    if (!this.deps) return null;
    let forceRefresh = options.forceRefresh === true;

    // A few rounds at most, in case logins and logouts keep overtaking the renewal.
    for (let round = 0; round < 3; round++) {
      const session = this.session;
      if (!session) return null;
      const generation = this.generation;

      if (!forceRefresh && session.accessToken && session.accessTokenExpiresAt - this.now() > ACCESS_TOKEN_RENEWAL_MARGIN_MS) {
        return session.accessToken;
      }

      try {
        const accessToken = await this.renewal(generation, session);
        if (generation === this.generation) return accessToken;
      } catch (error) {
        // The renewal itself ended this session (expired or revoked): the
        // caller learns why. A logout or login from elsewhere: look again.
        if (generation === this.generation || generation === this.expiredGeneration) throw error;
      }
      // Another session now. A forced renewal was meant for the old token.
      forceRefresh = false;
    }
    return null;
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
    const deps = this.requireDeps();

    if (!session.refreshToken) {
      this.expire(generation);
      throw new AuthFlowError('session-expired', 'No refresh token');
    }

    let tokens: TokenSet;
    let user = session.user;
    try {
      tokens = await deps.refresh(session.refreshToken);
      if (tokens.idToken) user = deps.readUser(tokens.idToken);
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

function errorNotice(error: unknown): AuthNotice {
  return { kind: isAuthFlowError(error, 'cancelled') ? 'info' : 'error', message: describeAuthError(error) };
}

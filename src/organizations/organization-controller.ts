// Which organisations the signed-in user belongs to, and which one the app
// works in. Screens read `state` and call select/added/removed; everything
// that shows rooms or bookings is keyed by the active organisation, so a
// switch never shows data of the previous one.
//
// Memberships and roles can change on another device while the app runs. The
// list is therefore synchronised at a few moments (`sync`): when the app
// returns to the foreground, when the user switches organisation, when an API
// answer says the access has changed, and when the user asks. There is no
// polling timer. The API decides every request on its own; this list only
// decides what the app offers.
//
// No React and no Expo imports: the API and the storage are passed in, so
// the whole flow runs in the Node tests.
import { ApiError } from '../api/http-client';
import type { OrganizationsApi } from '../api/organizations-api';
import type { KeyValueStore } from '../auth/session-storage';
import type { MembershipRole, Organization } from '../models/organization';

/** Something the user should know about the last synchronisation. */
export type OrganizationNotice =
  /** The active organisation is no longer in the user's list (removed, or the organisation deleted). */
  | { kind: 'access-removed'; organizationName: string }
  /** The user's role in the active organisation changed. */
  | { kind: 'role-changed'; organizationName: string; role: MembershipRole };

export type OrganizationsState =
  /** Nobody registered is signed in (or demo mode): no organisations to choose from. */
  | { status: 'inactive' }
  | { status: 'loading' }
  /**
   * `active` is null only when `organizations` is empty: the user needs
   * onboarding. `syncError`: the last synchronisation failed (offline, server
   * error), so the list may be out of date.
   */
  | {
      status: 'ready';
      organizations: Organization[];
      active: Organization | null;
      notice: OrganizationNotice | null;
      syncError: string | null;
    }
  | { status: 'error'; message: string };

/** Why a synchronisation was asked for. */
export type SyncReason =
  /** The app returned from the background. Skipped while the list is fresh. */
  | 'foreground'
  /** The user switched organisation. */
  | 'switch'
  /** An API answer said the user's access is gone or changed. */
  | 'access-changed'
  /** The user asked (e.g. "Prøv igen"). */
  | 'manual';

/** A foreground sync is skipped while the list is younger than this. */
export const FOREGROUND_SYNC_INTERVAL_MS = 30_000;

export interface OrganizationControllerDeps {
  api: Pick<OrganizationsApi, 'list'>;
  /** Remembers the chosen organisation per user (SecureStore on a phone). Null: not remembered. */
  store: KeyValueStore | null;
  describe(error: unknown): string;
  /** The current time in milliseconds; replaceable in tests. */
  now?: () => number;
}

type Listener = (state: OrganizationsState) => void;

const KEY_PREFIX = 'roombooking.organization.v1';

/** The storage key for a user's last chosen organisation. Keys may only use [A-Za-z0-9._-]. */
export function selectionKey(userPublicId: string): string {
  return `${KEY_PREFIX}.${userPublicId.replace(/[^A-Za-z0-9._-]/g, '_')}`;
}

export function sortOrganizations(organizations: Organization[]): Organization[] {
  return [...organizations].sort((a, b) => a.name.localeCompare(b.name, 'da', { sensitivity: 'base' }));
}

/**
 * The API refused the account itself (disabled, or no longer registered):
 * no organisation of the list may stay usable, not even as a stale copy.
 */
function isAccountDenied(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.kind === 'http' &&
    error.status === 403 &&
    (error.problem?.code === 'user_disabled' || error.problem?.code === 'user_not_registered')
  );
}

/** What changed for the organisation the user was working in. */
function noticeFor(previous: Organization, organizations: Organization[]): OrganizationNotice | null {
  const current = organizations.find((organization) => organization.publicId === previous.publicId);
  if (!current) return { kind: 'access-removed', organizationName: previous.name };
  if (current.role !== previous.role) return { kind: 'role-changed', organizationName: current.name, role: current.role };
  return null;
}

export class OrganizationController {
  private state: OrganizationsState = { status: 'inactive' };
  private readonly listeners = new Set<Listener>();
  private userId: string | null = null;
  /** The organisations /api/me returned; used if the API has no /api/organizations. */
  private fallback: Organization[] = [];
  /**
   * Bumped by every activate, deactivate, refresh and local membership
   * change. A list that arrives for an older generation (another user, an
   * earlier refresh, or a list fetched before the user created or left an
   * organisation) is dropped instead of replacing newer data.
   */
  private generation = 0;
  /** The refresh running now; a sync joins it instead of starting another. */
  private inFlight: Promise<void> | null = null;
  /** When the list was last loaded (ms), for the foreground interval. */
  private loadedAt: number | null = null;
  private readonly now: () => number;

  constructor(private readonly deps: OrganizationControllerDeps) {
    this.now = deps.now ?? Date.now;
  }

  getState = (): OrganizationsState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** The active organisation, or null. */
  get active(): Organization | null {
    return this.state.status === 'ready' ? this.state.active : null;
  }

  /**
   * Starts working for a registered user: loads their organisations and
   * picks the one they chose last time (or the first). Calling it again for
   * the same user only refreshes.
   */
  async activate(userPublicId: string, fromCurrentUser: Organization[] = []): Promise<void> {
    if (this.userId !== userPublicId) {
      this.userId = userPublicId;
      this.loadedAt = null;
      this.setState({ status: 'loading' });
    }
    this.fallback = fromCurrentUser;
    await this.refresh();
  }

  /** Signed out, or another account: forget everything about the previous user. */
  deactivate(): void {
    this.generation++;
    this.userId = null;
    this.fallback = [];
    this.loadedAt = null;
    this.setState({ status: 'inactive' });
  }

  /** Reloads the list now; the newest refresh wins. `preferredId` becomes active if the list contains it. */
  refresh(preferredId?: string): Promise<void> {
    const loading = this.load(preferredId);
    this.inFlight = loading;
    void loading.finally(() => {
      if (this.inFlight === loading) this.inFlight = null;
    });
    return loading;
  }

  /**
   * Brings the list up to date at a lifecycle moment without piling up
   * requests: it joins a refresh that is already running, and a foreground
   * sync is skipped while the list is younger than FOREGROUND_SYNC_INTERVAL_MS.
   */
  sync(reason: SyncReason): Promise<void> {
    if (this.userId === null) return Promise.resolve();
    if (this.inFlight) return this.inFlight;
    if (
      reason === 'foreground' &&
      this.state.status === 'ready' &&
      this.state.syncError === null &&
      this.loadedAt !== null &&
      this.now() - this.loadedAt < FOREGROUND_SYNC_INTERVAL_MS
    ) {
      return Promise.resolve();
    }
    return this.refresh();
  }

  /** Switches to one of the user's organisations, then checks the access with the API. */
  select(organizationId: string): void {
    if (this.state.status !== 'ready' || this.userId === null) return;
    const active = this.state.organizations.find((organization) => organization.publicId === organizationId);
    if (!active || active.publicId === this.state.active?.publicId) return;
    this.setState({ ...this.state, active, notice: null });
    void this.writeSelection(this.userId, active.publicId);
    void this.sync('switch');
  }

  /** A new membership (an organisation created, an invitation accepted): add it and switch to it. */
  added(organization: Organization): void {
    if (this.state.status !== 'ready' || this.userId === null) return;
    // A list already on its way was fetched without it.
    this.generation++;
    const others = this.state.organizations.filter((candidate) => candidate.publicId !== organization.publicId);
    const organizations = sortOrganizations([...others, organization]);
    this.setState({ ...this.state, organizations, active: organization, notice: null });
    void this.writeSelection(this.userId, organization.publicId);
  }

  /** The user left (or lost) an organisation: drop it and fall back to another. */
  removed(organizationId: string): void {
    if (this.state.status !== 'ready') return;
    // A list already on its way may still contain it.
    this.generation++;
    const organizations = this.state.organizations.filter((organization) => organization.publicId !== organizationId);
    const active =
      this.state.active?.publicId === organizationId ? (organizations[0] ?? null) : this.state.active;
    this.setState({ ...this.state, organizations, active });
    if (active && this.userId !== null) void this.writeSelection(this.userId, active.publicId);
  }

  /** The active organisation's details changed (e.g. renamed, or the user's role). */
  updated(organization: Organization): void {
    if (this.state.status !== 'ready') return;
    const organizations = sortOrganizations(
      this.state.organizations.map((candidate) => (candidate.publicId === organization.publicId ? organization : candidate)),
    );
    const active = this.state.active?.publicId === organization.publicId ? organization : this.state.active;
    this.setState({ ...this.state, organizations, active });
  }

  /** The user has read the notice. */
  dismissNotice(): void {
    if (this.state.status === 'ready' && this.state.notice) this.setState({ ...this.state, notice: null });
  }

  private async load(preferredId: string | undefined): Promise<void> {
    const userId = this.userId;
    if (userId === null) return;
    const generation = ++this.generation;

    let organizations: Organization[];
    try {
      organizations = await this.deps.api.list();
    } catch (error) {
      if (generation !== this.generation) return;
      // An API without the organisation endpoints answers 404 without a
      // problem code: show what /api/me said instead.
      if (error instanceof ApiError && error.kind === 'http' && error.status === 404 && error.problem?.code === undefined) {
        organizations = this.fallback;
      } else if (this.state.status === 'ready' && !isAccountDenied(error)) {
        // Offline or a server error: keep the list, say it may be out of
        // date, and let the next sync try again. It grants nothing: the API
        // still checks every request.
        this.setState({ ...this.state, syncError: this.deps.describe(error) });
        return;
      } else {
        // A first load, or the account itself refused: nothing stays usable.
        this.setState({ status: 'error', message: this.deps.describe(error) });
        return;
      }
    }
    if (generation !== this.generation) return;

    const sorted = sortOrganizations(organizations);
    // Read after the answer: the user may have switched while it was on its way.
    const previous = this.active;
    const stored = preferredId ?? previous?.publicId ?? (await this.readSelection(userId));
    if (generation !== this.generation) return;

    const active = sorted.find((organization) => organization.publicId === stored) ?? sorted[0] ?? null;
    // An explicit choice (preferredId) is the user's own doing, not news.
    const notice = previous && preferredId === undefined ? noticeFor(previous, sorted) : null;
    const earlierNotice = this.state.status === 'ready' ? this.state.notice : null;

    this.loadedAt = this.now();
    this.setState({ status: 'ready', organizations: sorted, active, notice: notice ?? earlierNotice, syncError: null });
    if (active) void this.writeSelection(userId, active.publicId);
  }

  private async readSelection(userId: string): Promise<string | undefined> {
    try {
      return (await this.deps.store?.getItem(selectionKey(userId))) ?? undefined;
    } catch {
      // A broken keystore only costs remembering the choice.
      return undefined;
    }
  }

  private async writeSelection(userId: string, organizationId: string): Promise<void> {
    try {
      await this.deps.store?.setItem(selectionKey(userId), organizationId);
    } catch {
      // Not remembered; the app still works.
    }
  }

  private setState(state: OrganizationsState): void {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }
}

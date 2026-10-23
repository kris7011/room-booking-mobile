// Which organisations the signed-in user belongs to, and which one the app
// works in. Screens read `state` and call select/added/removed; everything
// that shows rooms or bookings is keyed by the active organisation, so a
// switch never shows data of the previous one.
//
// No React and no Expo imports: the API and the storage are passed in, so
// the whole flow runs in the Node tests.
import { ApiError } from '../api/http-client';
import type { OrganizationsApi } from '../api/organizations-api';
import type { KeyValueStore } from '../auth/session-storage';
import type { Organization } from '../models/organization';

export type OrganizationsState =
  /** Nobody registered is signed in (or demo mode): no organisations to choose from. */
  | { status: 'inactive' }
  | { status: 'loading' }
  /** `active` is null only when `organizations` is empty: the user needs onboarding. */
  | { status: 'ready'; organizations: Organization[]; active: Organization | null }
  | { status: 'error'; message: string };

export interface OrganizationControllerDeps {
  api: Pick<OrganizationsApi, 'list'>;
  /** Remembers the chosen organisation per user (SecureStore on a phone). Null: not remembered. */
  store: KeyValueStore | null;
  describe(error: unknown): string;
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

export class OrganizationController {
  private state: OrganizationsState = { status: 'inactive' };
  private readonly listeners = new Set<Listener>();
  private userId: string | null = null;
  /** The organisations /api/me returned; used if the API has no /api/organizations. */
  private fallback: Organization[] = [];
  /**
   * Bumped by every activate, deactivate and refresh. A list that arrives
   * for an older generation (another user, or an earlier refresh) is
   * dropped instead of replacing newer data.
   */
  private generation = 0;

  constructor(private readonly deps: OrganizationControllerDeps) {}

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
    this.setState({ status: 'inactive' });
  }

  /** Reloads the list. `preferredId` becomes active if the list contains it. */
  async refresh(preferredId?: string): Promise<void> {
    const userId = this.userId;
    if (userId === null) return;
    const generation = ++this.generation;
    const previous = this.active?.publicId;

    let organizations: Organization[];
    try {
      organizations = await this.deps.api.list();
    } catch (error) {
      if (generation !== this.generation) return;
      // An API without the organisation endpoints answers 404 without a
      // problem code: show what /api/me said instead.
      if (error instanceof ApiError && error.kind === 'http' && error.status === 404 && error.problem?.code === undefined) {
        organizations = this.fallback;
      } else {
        // Keep showing the list we have; only a first load becomes an error.
        if (this.state.status !== 'ready') this.setState({ status: 'error', message: this.deps.describe(error) });
        return;
      }
    }
    if (generation !== this.generation) return;

    const sorted = sortOrganizations(organizations);
    const stored = preferredId ?? previous ?? (await this.readSelection(userId));
    if (generation !== this.generation) return;

    const active = sorted.find((organization) => organization.publicId === stored) ?? sorted[0] ?? null;
    this.setState({ status: 'ready', organizations: sorted, active });
    if (active) void this.writeSelection(userId, active.publicId);
  }

  /** Switches to one of the user's organisations. */
  select(organizationId: string): void {
    if (this.state.status !== 'ready' || this.userId === null) return;
    const active = this.state.organizations.find((organization) => organization.publicId === organizationId);
    if (!active || active.publicId === this.state.active?.publicId) return;
    this.setState({ ...this.state, active });
    void this.writeSelection(this.userId, active.publicId);
  }

  /** A new membership (an organisation created, an invitation accepted): add it and switch to it. */
  added(organization: Organization): void {
    if (this.state.status !== 'ready' || this.userId === null) return;
    const others = this.state.organizations.filter((candidate) => candidate.publicId !== organization.publicId);
    const organizations = sortOrganizations([...others, organization]);
    this.setState({ status: 'ready', organizations, active: organization });
    void this.writeSelection(this.userId, organization.publicId);
  }

  /** The user left (or lost) an organisation: drop it and fall back to another. */
  removed(organizationId: string): void {
    if (this.state.status !== 'ready') return;
    const organizations = this.state.organizations.filter((organization) => organization.publicId !== organizationId);
    const active =
      this.state.active?.publicId === organizationId ? (organizations[0] ?? null) : this.state.active;
    this.setState({ status: 'ready', organizations, active });
    if (active && this.userId !== null) void this.writeSelection(this.userId, active.publicId);
  }

  /** The active organisation's details changed (e.g. renamed, or the user's role). */
  updated(organization: Organization): void {
    if (this.state.status !== 'ready') return;
    const organizations = sortOrganizations(
      this.state.organizations.map((candidate) => (candidate.publicId === organization.publicId ? organization : candidate)),
    );
    const active = this.state.active?.publicId === organization.publicId ? organization : this.state.active;
    this.setState({ status: 'ready', organizations, active });
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

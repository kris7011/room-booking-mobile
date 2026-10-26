// What the app offers each role. It only decides what is shown: the API
// checks every request itself, whatever the app shows.
import type { LoadState } from '../models/load-state';
import type { Member, MembershipRole } from '../models/organization';

/** Owners and Admins: the administration page, rooms, members and invitations. */
export function canAdminister(role: MembershipRole): boolean {
  return role === 'Owner' || role === 'Admin';
}

export const canManageRooms = canAdminister;

/** Roles the user may invite: Owners Admins and Members, Admins only Members. Never Owner. */
export function invitableRoles(role: MembershipRole): MembershipRole[] {
  switch (role) {
    case 'Owner':
      return ['Member', 'Admin'];
    case 'Admin':
      return ['Member'];
    default:
      return [];
  }
}

/** Only Owners change roles (an Admin can never make anyone an Owner). */
export function canChangeRoles(role: MembershipRole): boolean {
  return role === 'Owner';
}

/** Owners remove anyone; everyone may remove themselves (leave). */
export function canRemoveMember(callerRole: MembershipRole, isSelf: boolean): boolean {
  return isSelf || callerRole === 'Owner';
}

/** What the member list offers for one member. */
export interface MemberActions {
  /** The role chips. */
  canChangeRole: boolean;
  /** "Fjern fra organisationen", or "Forlad organisationen" for the caller. */
  canRemove: boolean;
}

const NO_ACTIONS: MemberActions = { canChangeRole: false, canRemove: false };

/** The caller is the only Owner in the member list (false until it has loaded). */
export function isSoleOwner(list: LoadState<readonly Member[]>): boolean {
  if (list.status !== 'success') return false;
  const owners = list.data.filter((member) => member.role === 'Owner');
  return owners.length === 1 && owners[0].isCurrentUser;
}

/**
 * The actions for one member. Nothing is offered until the list has loaded:
 * whether the caller is the only Owner depends on all of it. The only Owner
 * is offered neither changing their own role nor leaving, which the API
 * refuses (409 last_owner) until someone else is Owner; with several Owners
 * each may do both. The list can be out of date: the API still decides.
 */
export function memberActions(callerRole: MembershipRole, member: Member, list: LoadState<readonly Member[]>): MemberActions {
  if (list.status !== 'success') return NO_ACTIONS;
  const lastOwnerSelf = member.isCurrentUser && isSoleOwner(list);
  return {
    canChangeRole: canChangeRoles(callerRole) && !lastOwnerSelf,
    canRemove: canRemoveMember(callerRole, member.isCurrentUser) && !lastOwnerSelf,
  };
}

/** Only Owners rename, and the legacy organisation keeps its name. */
export function canRename(role: MembershipRole, isLegacy: boolean): boolean {
  return role === 'Owner' && !isLegacy;
}

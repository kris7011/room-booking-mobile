// What the app offers each role. It only decides what is shown: the API
// checks every request itself, whatever the app shows.
import type { MembershipRole } from '../models/organization';

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

/** Only Owners rename, and the legacy organisation keeps its name. */
export function canRename(role: MembershipRole, isLegacy: boolean): boolean {
  return role === 'Owner' && !isLegacy;
}

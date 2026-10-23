// Mirrors the organisation endpoints of the .NET API
// (src/MeetingRoomBooking.Api/Features/Organizations, Rooms and Bookings).
import type { MembershipRole } from './current-user';

export type { MembershipRole };

/** GET/POST /api/organizations: an organisation the user is a member of. */
export interface Organization {
  publicId: string;
  name: string;
  /** The organisation that holds every room and booking from before organisations existed. */
  isLegacy: boolean;
  role: MembershipRole;
  createdUtc?: string;
}

/** GET /api/organizations/{id}. */
export interface OrganizationDetails extends Organization {
  memberCount: number;
  activeRoomCount: number;
}

/** A room as the organisation endpoints return it. */
export interface OrganizationRoom {
  id: number;
  name: string;
  capacity: number;
  /** Set for an archived room; only Owners and Admins see those. */
  archivedUtc: string | null;
}

export interface SaveRoomRequest {
  name: string;
  capacity: number;
}

/** A booking as the organisation endpoints return it. */
export interface OrganizationBooking {
  id: number;
  roomId: number;
  roomName: string;
  title: string;
  bookedBy: string;
  startUtc: string;
  endUtc: string;
  createdUtc: string;
  updatedUtc?: string | null;
  createdByCurrentUser: boolean;
  /** The user may change and delete it. The API checks every change itself. */
  canModify: boolean;
}

/** GET /api/organizations/{id}/members. */
export interface Member {
  userPublicId: string;
  displayName: string;
  role: MembershipRole;
  joinedUtc: string;
  isCurrentUser: boolean;
}

/** GET /api/organizations/{id}/invitations: open invitations, never their tokens. */
export interface Invitation {
  id: number;
  email: string;
  role: MembershipRole;
  createdUtc: string;
  expiresUtc: string;
  isExpired: boolean;
  invitedBy: string;
  canRevoke: boolean;
}

/** POST /api/organizations/{id}/invitations: the token is only in this response. */
export interface CreatedInvitation {
  organizationId: string;
  organizationName: string;
  email: string;
  role: MembershipRole;
  expiresUtc: string;
  token: string;
}

/** POST /api/invitations/accept: the membership the invitation gave. */
export interface AcceptedInvitation {
  publicId: string;
  name: string;
  isLegacy: boolean;
  role: MembershipRole;
}

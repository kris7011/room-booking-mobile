import type { BookingResponse, SaveBookingRequest } from '../models/booking';
import type {
  AcceptedInvitation,
  CreatedInvitation,
  Invitation,
  Member,
  MembershipRole,
  Organization,
  OrganizationBooking,
  OrganizationDetails,
  OrganizationRoom,
  SaveRoomRequest,
} from '../models/organization';
import type { AvailableRoomsQuery, MeetingRoom } from '../models/room';
import { requestJson } from './http-client';
import type { RoomBookingApi } from './room-booking-api';

/** The organisation endpoints: everything except searching and booking, which go through RoomBookingApi. */
export interface OrganizationsApi {
  list(): Promise<Organization[]>;
  /** idempotencyKey: one random UUID per new organisation, the same one when repeating a request. */
  create(name: string, idempotencyKey: string): Promise<Organization>;
  get(organizationId: string): Promise<OrganizationDetails>;
  rename(organizationId: string, name: string): Promise<Organization>;

  listRooms(organizationId: string, options?: { includeArchived?: boolean }): Promise<OrganizationRoom[]>;
  createRoom(organizationId: string, room: SaveRoomRequest): Promise<OrganizationRoom>;
  updateRoom(organizationId: string, roomId: number, room: SaveRoomRequest): Promise<OrganizationRoom>;
  archiveRoom(organizationId: string, roomId: number): Promise<OrganizationRoom>;
  restoreRoom(organizationId: string, roomId: number): Promise<OrganizationRoom>;

  listMembers(organizationId: string): Promise<Member[]>;
  changeRole(organizationId: string, userPublicId: string, role: MembershipRole): Promise<Member>;
  removeMember(organizationId: string, userPublicId: string): Promise<void>;

  listInvitations(organizationId: string): Promise<Invitation[]>;
  invite(organizationId: string, email: string, role: MembershipRole): Promise<CreatedInvitation>;
  revokeInvitation(organizationId: string, invitationId: number): Promise<void>;
  acceptInvitation(token: string): Promise<AcceptedInvitation>;
}

/** /api/organizations/{id}, with the ID encoded so it can never change the path. */
export function organizationPath(organizationId: string, rest = ''): string {
  return `/api/organizations/${encodeURIComponent(organizationId)}${rest}`;
}

export const liveOrganizationsApi: OrganizationsApi = {
  list: () => requestJson<Organization[]>('/api/organizations'),

  create: (name, idempotencyKey) =>
    requestJson<Organization>('/api/organizations', {
      method: 'POST',
      body: { name },
      headers: { 'Idempotency-Key': idempotencyKey },
    }),

  get: (organizationId) => requestJson<OrganizationDetails>(organizationPath(organizationId)),

  rename: (organizationId, name) =>
    requestJson<Organization>(organizationPath(organizationId), { method: 'PUT', body: { name } }),

  listRooms: (organizationId, options) =>
    requestJson<OrganizationRoom[]>(organizationPath(organizationId, '/rooms'), {
      query: { includeArchived: options?.includeArchived ? 'true' : undefined },
    }),

  createRoom: (organizationId, room) =>
    requestJson<OrganizationRoom>(organizationPath(organizationId, '/rooms'), { method: 'POST', body: room }),

  updateRoom: (organizationId, roomId, room) =>
    requestJson<OrganizationRoom>(organizationPath(organizationId, `/rooms/${roomId}`), { method: 'PUT', body: room }),

  archiveRoom: (organizationId, roomId) =>
    requestJson<OrganizationRoom>(organizationPath(organizationId, `/rooms/${roomId}/archive`), { method: 'POST' }),

  restoreRoom: (organizationId, roomId) =>
    requestJson<OrganizationRoom>(organizationPath(organizationId, `/rooms/${roomId}/restore`), { method: 'POST' }),

  listMembers: (organizationId) => requestJson<Member[]>(organizationPath(organizationId, '/members')),

  changeRole: (organizationId, userPublicId, role) =>
    requestJson<Member>(organizationPath(organizationId, `/members/${encodeURIComponent(userPublicId)}/role`), {
      method: 'PUT',
      body: { role },
    }),

  removeMember: (organizationId, userPublicId) =>
    requestJson<void>(organizationPath(organizationId, `/members/${encodeURIComponent(userPublicId)}`), {
      method: 'DELETE',
    }),

  listInvitations: (organizationId) => requestJson<Invitation[]>(organizationPath(organizationId, '/invitations')),

  invite: (organizationId, email, role) =>
    requestJson<CreatedInvitation>(organizationPath(organizationId, '/invitations'), {
      method: 'POST',
      body: { email, role },
    }),

  revokeInvitation: (organizationId, invitationId) =>
    requestJson<void>(organizationPath(organizationId, `/invitations/${invitationId}`), { method: 'DELETE' }),

  acceptInvitation: (token) =>
    requestJson<AcceptedInvitation>('/api/invitations/accept', { method: 'POST', body: { token } }),
};

/**
 * Searching and booking in one organisation, behind the same interface the
 * screens already use. Every request names the organisation in its path, so
 * a response can never belong to another one.
 */
export function organizationRoomBookingApi(organizationId: string): RoomBookingApi {
  const path = (rest: string) => organizationPath(organizationId, rest);
  return {
    getRooms: () => requestJson<OrganizationRoom[]>(path('/rooms')).then((rooms) => rooms.map(toMeetingRoom)),

    getAvailableRooms: (query: AvailableRoomsQuery) =>
      requestJson<OrganizationRoom[]>(path('/rooms/available'), {
        query: { startUtc: query.startUtc, endUtc: query.endUtc, minCapacity: query.minCapacity },
      }).then((rooms) => rooms.map(toMeetingRoom)),

    createBooking: (request: SaveBookingRequest) =>
      requestJson<OrganizationBooking>(path('/bookings'), { method: 'POST', body: request }) as Promise<BookingResponse>,

    listBookings: (fromUtc: string) => requestJson<OrganizationBooking[]>(path('/bookings'), { query: { fromUtc } }),

    deleteBooking: (bookingId: number) => requestJson<void>(path(`/bookings/${bookingId}`), { method: 'DELETE' }),
  };
}

function toMeetingRoom(room: OrganizationRoom): MeetingRoom {
  return { id: room.id, name: room.name, capacity: room.capacity };
}

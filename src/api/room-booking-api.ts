import { isDemoMode } from '../config/env';
import type { BookingResponse, SaveBookingRequest } from '../models/booking';
import type { OrganizationBooking } from '../models/organization';
import type { AvailableRoomsQuery, MeetingRoom } from '../models/room';
import { demoApi } from './demo-api';
import { liveApi } from './live-api';
import { organizationRoomBookingApi } from './organizations-api';

// The contract the screens depend on. The live API client (per organisation
// or the original endpoints) and the demo implementation fulfil it, so the
// UI does not care which one it talks to.
export interface RoomBookingApi {
  getRooms(): Promise<MeetingRoom[]>;
  getAvailableRooms(query: AvailableRoomsQuery): Promise<MeetingRoom[]>;
  createBooking(request: SaveBookingRequest): Promise<BookingResponse>;
  /** Bookings that end after fromUtc. Only where the API says what the user may change. */
  listBookings?(fromUtc: string): Promise<OrganizationBooking[]>;
  deleteBooking?(bookingId: number): Promise<void>;
}

/** Without an organisation: demo data, or the original endpoints (which the API may only allow signed in). */
export const roomBookingApi: RoomBookingApi = isDemoMode ? demoApi : liveApi;

/** The API for the chosen organisation; demo mode ignores it. */
export function roomBookingApiFor(organizationId: string | null): RoomBookingApi {
  if (isDemoMode || organizationId === null) return roomBookingApi;
  return organizationRoomBookingApi(organizationId);
}

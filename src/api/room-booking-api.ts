import { isDemoMode } from '../config/env';
import type { BookingResponse, SaveBookingRequest } from '../models/booking';
import type { AvailableRoomsQuery, MeetingRoom } from '../models/room';
import { demoApi } from './demo-api';
import { liveApi } from './live-api';

// The contract the screens depend on. Both the live API client and the demo
// implementation fulfil it, so the UI does not care which one it talks to.
export interface RoomBookingApi {
  getRooms(): Promise<MeetingRoom[]>;
  getAvailableRooms(query: AvailableRoomsQuery): Promise<MeetingRoom[]>;
  createBooking(request: SaveBookingRequest): Promise<BookingResponse>;
}

export const roomBookingApi: RoomBookingApi = isDemoMode ? demoApi : liveApi;

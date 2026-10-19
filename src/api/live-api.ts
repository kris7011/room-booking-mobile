import type { BookingResponse, SaveBookingRequest } from '../models/booking';
import type { AvailableRoomsQuery, MeetingRoom } from '../models/room';
import { requestJson } from './http-client';
import type { RoomBookingApi } from './room-booking-api';

// Talks to the .NET API at EXPO_PUBLIC_API_URL.
export const liveApi: RoomBookingApi = {
  getRooms() {
    return requestJson<MeetingRoom[]>('/api/rooms');
  },

  getAvailableRooms(query: AvailableRoomsQuery) {
    return requestJson<MeetingRoom[]>('/api/rooms/available', {
      query: {
        startUtc: query.startUtc,
        endUtc: query.endUtc,
        minCapacity: query.minCapacity,
      },
    });
  },

  createBooking(request: SaveBookingRequest) {
    return requestJson<BookingResponse>('/api/bookings', {
      method: 'POST',
      body: request,
    });
  },
};

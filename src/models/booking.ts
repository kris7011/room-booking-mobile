// Mirrors SaveBookingRequest / BookingResponse in the .NET API
// (src/MeetingRoomBooking.Api/Features/Bookings/BookingContracts.cs).

// Server-side limits from Booking.cs, reused for client-side validation.
export const MAX_TITLE_LENGTH = 200;
export const MAX_BOOKED_BY_LENGTH = 120;

// Body for POST /api/bookings (and PUT /api/bookings/{id}).
export interface SaveBookingRequest {
  roomId: number;
  title: string;
  bookedBy: string;
  /** ISO 8601 timestamp in UTC. */
  startUtc: string;
  /** ISO 8601 timestamp in UTC; must be after startUtc. */
  endUtc: string;
}

// Returned by POST /api/bookings with 201 Created.
export interface BookingResponse {
  id: number;
  roomId: number;
  roomName: string;
  title: string;
  bookedBy: string;
  startUtc: string;
  endUtc: string;
  createdUtc: string;
}

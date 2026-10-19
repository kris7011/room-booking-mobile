// Mirrors MeetingRoomResponse in the .NET API
// (src/MeetingRoomBooking.Api/Features/Rooms/RoomEndpoints.cs).
// ASP.NET Core serializes property names as camelCase.
export interface MeetingRoom {
  id: number;
  name: string;
  capacity: number;
}

// Query parameters for GET /api/rooms/available.
export interface AvailableRoomsQuery {
  /** ISO 8601 timestamp in UTC, e.g. 2026-10-20T07:00:00.000Z */
  startUtc: string;
  /** ISO 8601 timestamp in UTC; must be after startUtc. */
  endUtc: string;
  /** Optional on the server (defaults to 1); must be positive. */
  minCapacity?: number;
}

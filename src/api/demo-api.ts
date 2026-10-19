// DEMO DATA ONLY. Used when EXPO_PUBLIC_API_URL is not set, so the UI can be
// built and tested without the .NET backend. Nothing here is sent anywhere and
// demo bookings disappear when the app reloads.
import { ApiError } from './http-client';
import type { BookingResponse, SaveBookingRequest } from '../models/booking';
import type { AvailableRoomsQuery, MeetingRoom } from '../models/room';
import type { RoomBookingApi } from './room-booking-api';

const DEMO_LATENCY_MS = 500;

// Same rooms the API seeds in its InitialCreate migration.
const demoRooms: MeetingRoom[] = [
  { id: 1, name: 'Focus Room', capacity: 4 },
  { id: 2, name: 'Collaboration Room', capacity: 8 },
  { id: 3, name: 'Board Room', capacity: 12 },
];

interface DemoBooking {
  roomId: number;
  start: number;
  end: number;
}

// Recurring local-time blocks so some searches show fewer or no free rooms:
// Board Room 09:00–11:00 and Collaboration Room 13:00–14:00 every day.
const recurringBusyBlocks = [
  { roomId: 3, startHour: 9, endHour: 11 },
  { roomId: 2, startHour: 13, endHour: 14 },
];

const demoBookings: DemoBooking[] = [];
let nextDemoBookingId = 1;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRoomBusy(roomId: number, start: number, end: number): boolean {
  const day = new Date(start);
  const busyToday = recurringBusyBlocks
    .filter((block) => block.roomId === roomId)
    .map((block) => ({
      start: new Date(day).setHours(block.startHour, 0, 0, 0),
      end: new Date(day).setHours(block.endHour, 0, 0, 0),
    }));
  const booked = demoBookings.filter((booking) => booking.roomId === roomId);

  // Same overlap rule as the API: adjacent bookings are allowed.
  return [...busyToday, ...booked].some((slot) => slot.start < end && slot.end > start);
}

export const demoApi: RoomBookingApi = {
  async getRooms() {
    await delay(DEMO_LATENCY_MS);
    return [...demoRooms].sort((a, b) => a.name.localeCompare(b.name));
  },

  async getAvailableRooms(query: AvailableRoomsQuery) {
    await delay(DEMO_LATENCY_MS);
    const start = Date.parse(query.startUtc);
    const end = Date.parse(query.endUtc);
    const minimum = query.minCapacity ?? 1;

    // Mirrors the API's ordering: smallest fitting room first, then by name.
    return demoRooms
      .filter((room) => room.capacity >= minimum && !isRoomBusy(room.id, start, end))
      .sort((a, b) => a.capacity - b.capacity || a.name.localeCompare(b.name));
  },

  async createBooking(request: SaveBookingRequest): Promise<BookingResponse> {
    await delay(DEMO_LATENCY_MS);
    const room = demoRooms.find((candidate) => candidate.id === request.roomId);
    if (!room) {
      throw new ApiError('http', 'Meeting room does not exist.', 404, { code: 'meeting_room_not_found' });
    }

    const start = Date.parse(request.startUtc);
    const end = Date.parse(request.endUtc);
    if (isRoomBusy(room.id, start, end)) {
      throw new ApiError('http', 'The meeting room is already booked during the selected period.', 409, {
        code: 'booking_overlap',
      });
    }

    demoBookings.push({ roomId: room.id, start, end });
    return {
      id: nextDemoBookingId++,
      roomId: room.id,
      roomName: room.name,
      title: request.title.trim(),
      bookedBy: request.bookedBy.trim(),
      startUtc: request.startUtc,
      endUtc: request.endUtc,
      createdUtc: new Date().toISOString(),
    };
  },
};

import type { MeetingRoom } from '../../src/models/room';

// Fixed test data. The browser runs in Europe/Copenhagen with its clock frozen
// at FIXED_NOW, so the app's "today", day picker and default search window are
// the same on every machine and every day the tests run.

/** Monday 4 March 2030, 07:40 in Copenhagen (UTC+1; summer time starts 31 March). */
export const FIXED_NOW = new Date('2030-03-04T07:40:00+01:00');
export const TIME_ZONE = 'Europe/Copenhagen';

/** The rooms the API seeds in its first migration. */
export const ROOMS = {
  focus: { id: 1, name: 'Focus Room', capacity: 4 },
  collaboration: { id: 2, name: 'Collaboration Room', capacity: 8 },
  board: { id: 3, name: 'Board Room', capacity: 12 },
} as const satisfies Record<string, MeetingRoom>;

/** Seeded rooms in the order GET /api/rooms returns them (by name). */
export const ROOMS_BY_NAME = [ROOMS.board, ROOMS.collaboration, ROOMS.focus];

/** A UTC timestamp for a local time on FIXED_NOW's day, e.g. at('08:30'). */
export function at(localTime: string): string {
  return new Date(`2030-03-04T${localTime}:00+01:00`).toISOString();
}

/**
 * The app's default search window at FIXED_NOW: the next half hour, one hour
 * long. 08:00–09:00 in Copenhagen is 07:00–08:00 UTC.
 */
export const DEFAULT_SLOT = {
  startUtc: at('08:00'),
  endUtc: at('09:00'),
  label: 'Man 4. mar, 08:00–09:00',
} as const;

/** Default number of participants in the search form. */
export const DEFAULT_PARTICIPANTS = 4;

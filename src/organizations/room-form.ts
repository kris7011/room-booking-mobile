// The room form's rules, the same as the API's (RoomAdministrationService):
// a name of 1–100 characters after trimming, 1–500 seats.
import type { SaveRoomRequest } from '../models/organization';

export const MAX_ROOM_NAME_LENGTH = 100;
export const MAX_ROOM_CAPACITY = 500;

export interface RoomDraft {
  name: string;
  capacity: string;
}

export type RoomDraftResult =
  | { ok: true; room: SaveRoomRequest }
  | { ok: false; nameError?: string; capacityError?: string };

export function readRoomDraft(draft: RoomDraft): RoomDraftResult {
  const name = draft.name.trim().replace(/\s+/g, ' ');
  const capacityText = draft.capacity.trim();
  const capacity = Number(capacityText);

  const nameError =
    name.length === 0
      ? 'Skriv et navn.'
      : name.length > MAX_ROOM_NAME_LENGTH
        ? `Navnet må højst have ${MAX_ROOM_NAME_LENGTH} tegn.`
        : undefined;
  const capacityError =
    !/^\d+$/.test(capacityText) || capacity < 1 || capacity > MAX_ROOM_CAPACITY
      ? `Skriv et antal pladser fra 1 til ${MAX_ROOM_CAPACITY}.`
      : undefined;

  return nameError || capacityError ? { ok: false, nameError, capacityError } : { ok: true, room: { name, capacity } };
}

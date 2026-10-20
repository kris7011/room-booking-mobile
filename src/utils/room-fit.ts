// Texts that describe how a room fits a search. A booking reserves the whole
// room, so the number of seats left over is not something the user gets; the
// card only says how big the room is and that it fits the group.

/** "1 deltager", "4 deltagere". */
export function participantsLabel(count: number): string {
  return `${count} ${count === 1 ? 'deltager' : 'deltagere'}`;
}

/** "Plads til 1 person", "Plads til 8 personer". */
export function capacityLabel(capacity: number): string {
  return `Plads til ${capacity} ${capacity === 1 ? 'person' : 'personer'}`;
}

/**
 * "Passer til 4 deltagere · hele lokalet reserveres", or null when the room
 * is too small or there is no valid participant count.
 */
export function roomFitLabel(capacity: number, participants: number): string | null {
  if (!Number.isInteger(participants) || participants < 1 || participants > capacity) return null;
  return `Passer til ${participantsLabel(participants)} · hele lokalet reserveres`;
}

// The user picks a local day and local times; the API wants UTC timestamps.
// We keep times as "minutes since local midnight" in the UI because that makes
// stepping and comparing trivial, and only build Date objects at the edges.

export const SLOT_MINUTES = 30;
export const FIRST_SLOT = 6 * 60; // 06:00
export const LAST_SLOT = 22 * 60; // 22:00

const WEEKDAYS = ['Søn', 'Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

export function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function isSameDay(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

/** Combines a local day with minutes since midnight. setHours handles DST. */
export function atMinutes(day: Date, minutes: number): Date {
  const result = startOfDay(day);
  result.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return result;
}

export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function formatTime(date: Date): string {
  return formatMinutes(date.getHours() * 60 + date.getMinutes());
}

export function weekdayLabel(date: Date, today: Date): string {
  if (isSameDay(date, today)) return 'I dag';
  if (isSameDay(date, addDays(today, 1))) return 'I morgen';
  return WEEKDAYS[date.getDay()];
}

/** e.g. "20. okt" */
export function shortDateLabel(date: Date): string {
  return `${date.getDate()}. ${MONTHS[date.getMonth()]}`;
}

/** e.g. "Man 20. okt, 09:00–10:00" */
export function formatRange(start: Date, end: Date): string {
  return `${WEEKDAYS[start.getDay()]} ${shortDateLabel(start)}, ${formatTime(start)}–${formatTime(end)}`;
}

/** The default meeting length. */
export const DEFAULT_DURATION_MINUTES = 60;
/** Suggested start when nothing is left today or before opening hours. */
export const MORNING_START = 9 * 60; // 09:00

/**
 * The next half-hour slot from now that fits a meeting of `durationMinutes`
 * before closing time, or 09:00 (earlier for very long meetings) if today is
 * over. Before opening hours it suggests 09:00 today.
 */
export function defaultSearchWindow(
  now: Date,
  durationMinutes: number = DEFAULT_DURATION_MINUTES,
): { day: Date; startMinutes: number; endMinutes: number } {
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const nextSlot = Math.ceil((nowMinutes + 1) / SLOT_MINUTES) * SLOT_MINUTES;
  const morningStart = Math.max(FIRST_SLOT, Math.min(MORNING_START, LAST_SLOT - durationMinutes));
  const morning = { startMinutes: morningStart, endMinutes: morningStart + durationMinutes };

  if (nextSlot < FIRST_SLOT) {
    return { day: startOfDay(now), ...morning };
  }
  if (nextSlot + durationMinutes > LAST_SLOT) {
    return { day: addDays(startOfDay(now), 1), ...morning };
  }
  return { day: startOfDay(now), startMinutes: nextSlot, endMinutes: nextSlot + durationMinutes };
}

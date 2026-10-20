// Which meeting time the search form shows, and whether it is still bookable.
//
// Until the user picks a day or time themselves, the form follows the clock:
// the window is derived from "now" on every render instead of being stored,
// so it can never go stale. Once the user has chosen, their choice is kept as
// is. If it has started in the meantime, the form says so and offers the next
// possible time instead of changing it behind their back.

import type { SearchWindow } from '../models/search-criteria';
import { atMinutes, defaultSearchWindow, formatMinutes, formatRange, isSameDay, weekdayLabel } from './date-time';

/** The window the form shows: the user's choice, or else the default for `now`. */
export function resolveSearchWindow(chosen: SearchWindow | null, now: Date): SearchWindow {
  return chosen ?? defaultSearchWindow(now);
}

export function hasStarted(window: SearchWindow, now: Date): boolean {
  return atMinutes(window.day, window.startMinutes).getTime() <= now.getTime();
}

export interface StartedWindow {
  /** Explains what has passed, in plain Danish. */
  message: string;
  /** The next possible window with the same duration. */
  suggestion: SearchWindow;
  /** e.g. "I dag 12:00–13:00" or "I morgen 09:00–10:30". */
  suggestionLabel: string;
}

/** Null while `window` still lies ahead; otherwise what to tell the user. */
export function checkSearchWindow(window: SearchWindow, now: Date): StartedWindow | null {
  if (!hasStarted(window, now)) return null;

  // Only today or an earlier day can have started, e.g. after midnight.
  const message = isSameDay(window.day, now)
    ? `Starttidspunktet ${formatMinutes(window.startMinutes)} i dag er passeret.`
    : `Det valgte tidspunkt, ${formatRange(
        atMinutes(window.day, window.startMinutes),
        atMinutes(window.day, window.endMinutes),
      )}, er passeret.`;

  const suggestion = defaultSearchWindow(now, window.endMinutes - window.startMinutes);
  const suggestionLabel = `${weekdayLabel(suggestion.day, now)} ${formatMinutes(suggestion.startMinutes)}–${formatMinutes(
    suggestion.endMinutes,
  )}`;

  return { message, suggestion, suggestionLabel };
}

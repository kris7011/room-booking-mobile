import type { OrganizationBooking } from '../models/organization';

/** What the list of upcoming bookings shows for one booking, in Danish. */
export interface BookingListText {
  heading: string;
  /** "Booket af …", or null when the API hid who booked it. */
  bookedBy: string | null;
}

/** The heading of a booking whose details the API hid from a Member. */
export const HIDDEN_BOOKING_HEADING = 'Optaget';

/**
 * A Member sees other people's bookings without title and booked-by (the API
 * sends null and `detailsHidden`). The list then says only that the room is
 * taken; the room and time are shown by the caller as for every booking.
 * A null title without the flag (which the API never sends) is treated the
 * same way, so nothing ever reads "null".
 */
export function bookingListText(booking: OrganizationBooking): BookingListText {
  if (booking.detailsHidden || booking.title === null) {
    return { heading: HIDDEN_BOOKING_HEADING, bookedBy: null };
  }
  const bookedBy = booking.bookedBy === null ? null : `Booket af ${booking.bookedBy}${booking.createdByCurrentUser ? ' (dig)' : ''}`;
  return { heading: booking.title, bookedBy };
}

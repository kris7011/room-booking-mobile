import { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import type { RoomBookingApi } from '../api/room-booking-api';
import { bookingListText } from '../bookings/booking-display';
import type { LoadState } from '../models/load-state';
import type { OrganizationBooking } from '../models/organization';
import { describeOrganizationError } from '../organizations/organization-messages';
import { formatRange } from '../utils/date-time';
import { StatusMessage } from './StatusMessage';
import { Card, ConfirmAction, uiStyles } from './ui';

interface UpcomingBookingsProps {
  api: RoomBookingApi;
  now: Date;
  /** Changes after a new booking, so the list reloads. */
  version: number;
}

/**
 * The organisation's bookings that have not ended. Delete is offered only
 * where the API says the user may (canModify); the API checks it again.
 * Other people's bookings reach a Member without title and booked-by, and
 * are shown as "Optaget" with their room and time.
 */
export function UpcomingBookings({ api, now, version }: UpcomingBookingsProps) {
  const [state, setState] = useState<LoadState<OrganizationBooking[]>>({ status: 'idle' });
  const [deleting, setDeleting] = useState<number | null>(null);
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const latest = useRef(0);
  const fromUtc = now.toISOString();

  const load = useCallback(async () => {
    if (!api.listBookings) return;
    const request = ++latest.current;
    setState((previous) => (previous.status === 'success' ? previous : { status: 'loading' }));
    try {
      const bookings = await api.listBookings(fromUtc);
      if (request === latest.current) setState({ status: 'success', data: bookings });
    } catch (error) {
      if (request === latest.current) setState({ status: 'error', message: describeOrganizationError(error) });
    }
  }, [api, fromUtc]);

  useEffect(() => {
    void load();
  }, [load, version]);

  const remove = async (booking: OrganizationBooking) => {
    if (!api.deleteBooking) return;
    setDeleting(booking.id);
    setMessage(null);
    try {
      await api.deleteBooking(booking.id);
      setMessage({ kind: 'success', text: `Bookingen "${bookingListText(booking).heading}" er slettet.` });
      await load();
    } catch (error) {
      setMessage({ kind: 'error', text: describeOrganizationError(error) });
    } finally {
      setDeleting(null);
    }
  };

  return (
    <Card title="Kommende bookinger" testID="upcoming-bookings">
      {message ? (
        <Text style={message.kind === 'error' ? uiStyles.error : uiStyles.success} accessibilityLiveRegion="polite">
          {message.text}
        </Text>
      ) : null}
      {state.status === 'idle' || state.status === 'loading' ? (
        <StatusMessage variant="loading" title="Henter bookinger…" />
      ) : state.status === 'error' ? (
        <StatusMessage variant="error" title="Kunne ikke hente bookinger" message={state.message} actionLabel="Prøv igen" onAction={() => void load()} />
      ) : state.data.length === 0 ? (
        <Text style={uiStyles.caption}>Der er ingen kommende bookinger.</Text>
      ) : (
        state.data.map((booking) => {
          const text = bookingListText(booking);
          return (
          <View key={booking.id} style={uiStyles.listItem}>
            <View style={uiStyles.between}>
              <Text style={[uiStyles.strong, uiStyles.flex]} numberOfLines={1}>
                {text.heading}
              </Text>
              {booking.canModify && api.deleteBooking ? (
                <ConfirmAction
                  label="Slet"
                  confirmLabel="Bekræft sletning"
                  busy={deleting === booking.id}
                  onConfirm={() => void remove(booking)}
                />
              ) : null}
            </View>
            <Text style={uiStyles.caption}>
              {booking.roomName} · {formatRange(new Date(booking.startUtc), new Date(booking.endUtc))}
            </Text>
            {text.bookedBy ? <Text style={uiStyles.caption}>{text.bookedBy}</Text> : null}
          </View>
          );
        })
      )}
    </Card>
  );
}

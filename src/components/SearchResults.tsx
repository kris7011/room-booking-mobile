import { Fragment } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { BookingResponse } from '../models/booking';
import type { LoadState } from '../models/load-state';
import type { MeetingRoom } from '../models/room';
import { colors, spacing, typography } from '../theme/theme';
import { formatRange } from '../utils/date-time';
import { BookingForm } from './BookingForm';
import { RoomCard } from './RoomCard';
import { StatusMessage } from './StatusMessage';

interface SearchResultsProps {
  state: LoadState<MeetingRoom[]>;
  start: Date;
  end: Date;
  participants: number;
  selectedRoomId: number | null;
  onSelectRoom: (roomId: number | null) => void;
  onRetry: () => void;
  onBooked: (booking: BookingResponse) => void;
}

export function SearchResults({
  state,
  start,
  end,
  participants,
  selectedRoomId,
  onSelectRoom,
  onRetry,
  onBooked,
}: SearchResultsProps) {
  switch (state.status) {
    case 'idle':
      return null;

    case 'loading':
      return <StatusMessage variant="loading" title="Søger efter ledige lokaler…" />;

    case 'error':
      return (
        <StatusMessage
          variant="error"
          title="Søgningen mislykkedes"
          message={state.message}
          actionLabel="Prøv igen"
          onAction={onRetry}
        />
      );

    case 'success':
      if (state.data.length === 0) {
        return (
          <StatusMessage
            variant="empty"
            title="Ingen ledige lokaler"
            message={`Intet lokale med plads til ${participants} er ledigt ${formatRange(start, end)}. Prøv et andet tidspunkt eller færre deltagere.`}
          />
        );
      }

      return (
        <View style={styles.list}>
          <Text style={styles.heading}>
            {state.data.length} {state.data.length === 1 ? 'ledigt lokale' : 'ledige lokaler'}
          </Text>
          <Text style={styles.subheading}>{formatRange(start, end)} · mindste passende lokale først</Text>
          {state.data.map((room) => {
            const selected = room.id === selectedRoomId;
            return (
              <Fragment key={room.id}>
                <RoomCard
                  room={room}
                  participants={participants}
                  selected={selected}
                  onPress={() => onSelectRoom(selected ? null : room.id)}
                />
                {selected ? (
                  <BookingForm
                    room={room}
                    start={start}
                    end={end}
                    onBooked={onBooked}
                    onCancel={() => onSelectRoom(null)}
                  />
                ) : null}
              </Fragment>
            );
          })}
        </View>
      );
  }
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  heading: { ...typography.heading, color: colors.text },
  subheading: { ...typography.caption, color: colors.textMuted, marginTop: -spacing.sm },
});

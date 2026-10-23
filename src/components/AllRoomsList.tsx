import { StyleSheet, Text, View } from 'react-native';

import type { LoadState } from '../models/load-state';
import type { MeetingRoom } from '../models/room';
import { colors, spacing, typography } from '../theme/theme';
import { RoomCard } from './RoomCard';
import { StatusMessage } from './StatusMessage';

interface AllRoomsListProps {
  state: LoadState<MeetingRoom[]>;
  onRetry: () => void;
  /** Defaults to "Alle mødelokaler". */
  title?: string;
}

// Overview of every room (GET /api/rooms), shown before the first search.
export function AllRoomsList({ state, onRetry, title = 'Alle mødelokaler' }: AllRoomsListProps) {
  return (
    <View style={styles.list}>
      <Text style={styles.heading}>{title}</Text>
      {state.status === 'loading' || state.status === 'idle' ? (
        <StatusMessage variant="loading" title="Henter mødelokaler…" />
      ) : state.status === 'error' ? (
        <StatusMessage
          variant="error"
          title="Kunne ikke hente mødelokaler"
          message={state.message}
          actionLabel="Prøv igen"
          onAction={onRetry}
        />
      ) : state.data.length === 0 ? (
        <StatusMessage variant="empty" title="Der er ingen mødelokaler endnu" />
      ) : (
        // A plain map is fine for a handful of rooms; switch to FlatList if the
        // list grows to dozens, so off-screen cards are not rendered.
        state.data.map((room) => <RoomCard key={room.id} room={room} />)
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  heading: { ...typography.heading, color: colors.text },
});

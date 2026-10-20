import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { MeetingRoom } from '../models/room';
import { colors, radius, spacing, typography } from '../theme/theme';
import { capacityLabel, roomFitLabel } from '../utils/room-fit';

interface RoomCardProps {
  room: MeetingRoom;
  /** When set, the card says that the room fits this many people. */
  participants?: number;
  selected?: boolean;
  /** Without onPress the card is display-only. */
  onPress?: () => void;
}

export function RoomCard({ room, participants, selected = false, onPress }: RoomCardProps) {
  const initials = room.name
    .split(' ')
    .map((word) => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  // A booking reserves the whole room, so the card says it fits the group
  // rather than how many seats are left over.
  const fit = participants !== undefined ? roomFitLabel(room.capacity, participants) : null;

  const content = (
    <View style={styles.row}>
      <View style={[styles.avatar, selected && styles.avatarSelected]}>
        <Text style={[styles.initials, selected && styles.initialsSelected]}>{initials}</Text>
      </View>
      <View style={styles.details}>
        <Text style={styles.name} numberOfLines={1}>
          {room.name}
        </Text>
        <Text style={styles.capacity}>{capacityLabel(room.capacity)}</Text>
        {fit ? <Text style={styles.fit}>{fit}</Text> : null}
      </View>
      {onPress ? <Text style={styles.action}>{selected ? 'Valgt ✓' : 'Vælg'}</Text> : null}
    </View>
  );

  if (!onPress) {
    return <View style={styles.card}>{content}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${room.name}, plads til ${room.capacity}`}
      style={({ pressed }) => [styles.card, selected && styles.cardSelected, pressed && styles.cardPressed]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },
  cardSelected: { borderColor: colors.primary, borderWidth: 2, padding: spacing.lg - 1 },
  cardPressed: { backgroundColor: colors.surfaceMuted },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSelected: { backgroundColor: colors.primary },
  initials: { ...typography.heading, color: colors.primary },
  initialsSelected: { color: colors.onPrimary },
  details: { flex: 1, gap: 2 },
  name: { ...typography.heading, color: colors.text },
  capacity: { ...typography.body, color: colors.textMuted },
  fit: { ...typography.caption, color: colors.success },
  action: { ...typography.label, color: colors.primary },
});

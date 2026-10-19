import { ScrollView, StyleSheet } from 'react-native';

import { spacing } from '../theme/theme';
import { addDays, isSameDay, shortDateLabel, startOfDay, weekdayLabel } from '../utils/date-time';
import { Chip } from './Chip';

const DAYS_AHEAD = 14;

interface DaySelectorProps {
  value: Date;
  onChange: (day: Date) => void;
  today: Date;
}

// Horizontal strip of the next two weeks. A custom picker instead of a native
// date picker library keeps it dependency-free and identical on web and mobile.
export function DaySelector({ value, onChange, today }: DaySelectorProps) {
  const first = startOfDay(today);
  const days = Array.from({ length: DAYS_AHEAD }, (_, index) => addDays(first, index));

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {days.map((day) => (
        <Chip
          key={day.getTime()}
          label={weekdayLabel(day, today)}
          caption={shortDateLabel(day)}
          selected={isSameDay(day, value)}
          onPress={() => onChange(day)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, paddingVertical: 2 },
});

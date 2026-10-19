import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '../theme/theme';
import { FIRST_SLOT, LAST_SLOT, SLOT_MINUTES, formatMinutes } from '../utils/date-time';
import { StepperButton } from './StepperButton';

interface TimeRangePickerProps {
  startMinutes: number;
  endMinutes: number;
  onChange: (range: { startMinutes: number; endMinutes: number }) => void;
}

// Start and end time in 30-minute steps. Moving the start keeps the meeting
// length; the end can never be at or before the start.
export function TimeRangePicker({ startMinutes, endMinutes, onChange }: TimeRangePickerProps) {
  const duration = endMinutes - startMinutes;

  const changeStart = (delta: number) => {
    const nextStart = startMinutes + delta;
    const nextEnd = Math.min(LAST_SLOT, nextStart + duration);
    onChange({ startMinutes: nextStart, endMinutes: Math.max(nextEnd, nextStart + SLOT_MINUTES) });
  };

  const changeEnd = (delta: number) => onChange({ startMinutes, endMinutes: endMinutes + delta });

  return (
    <View style={styles.container}>
      <TimeStepper
        label="Start"
        minutes={startMinutes}
        onDecrease={() => changeStart(-SLOT_MINUTES)}
        onIncrease={() => changeStart(SLOT_MINUTES)}
        canDecrease={startMinutes > FIRST_SLOT}
        canIncrease={startMinutes + SLOT_MINUTES < LAST_SLOT}
      />
      <TimeStepper
        label="Slut"
        minutes={endMinutes}
        onDecrease={() => changeEnd(-SLOT_MINUTES)}
        onIncrease={() => changeEnd(SLOT_MINUTES)}
        canDecrease={endMinutes - SLOT_MINUTES > startMinutes}
        canIncrease={endMinutes < LAST_SLOT}
      />
    </View>
  );
}

interface TimeStepperProps {
  label: string;
  minutes: number;
  onDecrease: () => void;
  onIncrease: () => void;
  canDecrease: boolean;
  canIncrease: boolean;
}

function TimeStepper({ label, minutes, onDecrease, onIncrease, canDecrease, canIncrease }: TimeStepperProps) {
  const time = formatMinutes(minutes);
  return (
    <View style={styles.stepper}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <StepperButton
          symbol="−"
          onPress={onDecrease}
          disabled={!canDecrease}
          accessibilityLabel={`${label} 30 minutter tidligere`}
        />
        <Text style={styles.time} accessibilityLabel={`${label} ${time}`}>
          {time}
        </Text>
        <StepperButton
          symbol="+"
          onPress={onIncrease}
          disabled={!canIncrease}
          accessibilityLabel={`${label} 30 minutter senere`}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap' },
  stepper: {
    flex: 1,
    minWidth: 150,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  label: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  time: { fontSize: 22, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
});

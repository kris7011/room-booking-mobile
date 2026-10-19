import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '../theme/theme';
import { Chip } from './Chip';
import { StepperButton } from './StepperButton';

export const MIN_PARTICIPANTS = 1;
export const MAX_PARTICIPANTS = 50;
const QUICK_PICKS = [2, 4, 6, 8, 12];

interface ParticipantPickerProps {
  value: number;
  onChange: (value: number) => void;
}

// Controlled component: the parent owns the number and passes it in via
// `value`; we only report changes through `onChange`.
export function ParticipantPicker({ value, onChange }: ParticipantPickerProps) {
  const setClamped = (next: number) => onChange(Math.min(MAX_PARTICIPANTS, Math.max(MIN_PARTICIPANTS, next)));

  return (
    <View style={styles.container}>
      <View style={styles.stepperRow}>
        <StepperButton
          symbol="−"
          onPress={() => setClamped(value - 1)}
          disabled={value <= MIN_PARTICIPANTS}
          accessibilityLabel="Færre deltagere"
        />
        <View style={styles.valueBox} accessibilityLiveRegion="polite">
          <Text style={styles.value}>{value}</Text>
          <Text style={styles.unit}>{value === 1 ? 'deltager' : 'deltagere'}</Text>
        </View>
        <StepperButton
          symbol="+"
          onPress={() => setClamped(value + 1)}
          disabled={value >= MAX_PARTICIPANTS}
          accessibilityLabel="Flere deltagere"
        />
      </View>
      <View style={styles.quickRow}>
        {QUICK_PICKS.map((count) => (
          <Chip
            key={count}
            label={String(count)}
            selected={count === value}
            onPress={() => onChange(count)}
            accessibilityLabel={`${count} deltagere`}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.md },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  valueBox: { alignItems: 'center', flex: 1 },
  value: { fontSize: 32, fontWeight: '700', color: colors.text },
  unit: { ...typography.caption, color: colors.textMuted },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});

import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, radius } from '../theme/theme';

interface StepperButtonProps {
  symbol: '−' | '+';
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel: string;
}

// Round −/+ button shared by the participant picker and the time steppers.
export function StepperButton({ symbol, onPress, disabled = false, accessibilityLabel }: StepperButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      // Enlarges the touch target beyond the visible circle.
      hitSlop={8}
      style={({ pressed }) => [styles.button, pressed && styles.pressed, disabled && styles.disabled]}
    >
      <Text style={styles.symbol}>{symbol}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { backgroundColor: colors.border },
  disabled: { opacity: 0.35 },
  symbol: { fontSize: 22, lineHeight: 24, fontWeight: '600', color: colors.primary },
});

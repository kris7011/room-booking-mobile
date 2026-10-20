import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '../theme/theme';

interface ChipProps {
  label: string;
  caption?: string;
  selected: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}

// Selectable pill used for days and quick participant counts.
export function Chip({ label, caption, selected, onPress, accessibilityLabel }: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      // aria-selected rather than accessibilityState: React Native Web only
      // maps the former to the DOM; iOS and Android understand both.
      aria-selected={selected}
      style={({ pressed }) => [styles.chip, selected && styles.selected, pressed && !selected && styles.pressed]}
    >
      <View style={styles.content}>
        <Text style={[styles.label, selected && styles.selectedText]}>{label}</Text>
        {caption ? <Text style={[styles.caption, selected && styles.selectedText]}>{caption}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minWidth: 48,
    minHeight: 40,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: 'center',
  },
  selected: { backgroundColor: colors.primary, borderColor: colors.primary },
  pressed: { backgroundColor: colors.surfaceMuted },
  content: { alignItems: 'center' },
  label: { ...typography.label, color: colors.text },
  caption: { ...typography.caption, color: colors.textMuted, marginTop: 2 },
  selectedText: { color: colors.onPrimary },
});

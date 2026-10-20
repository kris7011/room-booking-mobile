import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '../theme/theme';
import { PrimaryButton } from './PrimaryButton';

type Variant = 'loading' | 'error' | 'empty' | 'warning' | 'success';

interface StatusMessageProps {
  variant: Variant;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}

const variantColors: Record<Variant, { background: string; text: string }> = {
  loading: { background: colors.surfaceMuted, text: colors.textMuted },
  error: { background: colors.dangerSoft, text: colors.danger },
  empty: { background: colors.warningSoft, text: colors.warning },
  warning: { background: colors.warningSoft, text: colors.warning },
  success: { background: colors.successSoft, text: colors.success },
};

// One component for the loading, error, empty, warning and success states so they look
// consistent everywhere.
export function StatusMessage({ variant, title, message, actionLabel, onAction }: StatusMessageProps) {
  const palette = variantColors[variant];

  return (
    <View
      style={[styles.box, { backgroundColor: palette.background }]}
      accessibilityRole={variant === 'error' ? 'alert' : undefined}
      accessibilityLiveRegion="polite"
    >
      {variant === 'loading' ? <ActivityIndicator color={colors.primary} /> : null}
      <Text style={[styles.title, { color: palette.text }]}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {actionLabel && onAction ? <PrimaryButton label={actionLabel} onPress={onAction} variant="secondary" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm, alignItems: 'center' },
  title: { ...typography.body, fontWeight: '700', textAlign: 'center' },
  message: { ...typography.body, color: colors.text, textAlign: 'center' },
});

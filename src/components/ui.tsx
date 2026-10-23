// Small building blocks for the organisation screens, in the app's existing
// blue/white style: a card, a labelled text field, a role badge and a
// two-step button for actions that cannot be undone.
import { useState, type ComponentPropsWithRef, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { describeRole } from '../api/current-user';
import type { MembershipRole } from '../models/organization';
import { colors, radius, spacing, typography } from '../theme/theme';
import { useRevealFocusedInput } from './KeyboardAwareScrollView';
import { PrimaryButton } from './PrimaryButton';

export function Card({ title, subtitle, children, testID }: { title?: string; subtitle?: string; children: ReactNode; testID?: string }) {
  return (
    <View style={styles.card} testID={testID}>
      {title ? <Text style={styles.cardTitle}>{title}</Text> : null}
      {subtitle ? <Text style={styles.cardSubtitle}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

interface TextFieldProps extends ComponentPropsWithRef<typeof TextInput> {
  label: string;
  error?: string | null;
}

export function TextField({ label, error, style, ...inputProps }: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const revealFocusedInput = useRevealFocusedInput();

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...inputProps}
        onFocus={() => {
          setFocused(true);
          revealFocusedInput();
        }}
        onBlur={() => setFocused(false)}
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={label}
        style={[styles.input, focused && styles.inputFocused, error ? styles.inputError : null, style]}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

export function RoleBadge({ role }: { role: MembershipRole }) {
  return (
    <View style={[styles.badge, role === 'Owner' && styles.badgeOwner]}>
      <Text style={[styles.badgeText, role === 'Owner' && styles.badgeOwnerText]}>{describeRole(role)}</Text>
    </View>
  );
}

/**
 * A link-styled action that asks once more before it runs: "Slet" becomes
 * "Bekræft" and "Fortryd". Works the same on Android, iOS and web.
 */
export function ConfirmAction({
  label,
  confirmLabel,
  onConfirm,
  busy = false,
  destructive = true,
}: {
  label: string;
  confirmLabel: string;
  onConfirm: () => void;
  busy?: boolean;
  destructive?: boolean;
}) {
  const [asking, setAsking] = useState(false);

  if (busy) return <Text style={styles.actionMuted}>Vent…</Text>;

  if (!asking) {
    return (
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => setAsking(true)} hitSlop={8}>
        <Text style={[styles.action, destructive && styles.actionDanger]}>{label}</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.row}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={confirmLabel}
        onPress={() => {
          setAsking(false);
          onConfirm();
        }}
        hitSlop={8}
      >
        <Text style={[styles.action, destructive && styles.actionDanger]}>{confirmLabel}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Fortryd" onPress={() => setAsking(false)} hitSlop={8}>
        <Text style={styles.action}>Fortryd</Text>
      </Pressable>
    </View>
  );
}

/** A small text button. */
export function LinkButton({ label, onPress, disabled = false }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} disabled={disabled} hitSlop={8}>
      <Text style={[styles.action, disabled && styles.actionMuted]}>{label}</Text>
    </Pressable>
  );
}

export { PrimaryButton };

export const uiStyles = StyleSheet.create({
  stack: { gap: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  flex: { flex: 1 },
  caption: { ...typography.caption, color: colors.textMuted },
  body: { ...typography.body, color: colors.text },
  strong: { ...typography.body, fontWeight: '700', color: colors.text },
  listItem: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    gap: spacing.xs,
  },
  success: { ...typography.caption, color: colors.success },
  error: { ...typography.caption, color: colors.danger },
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    boxShadow: '0 4px 12px rgba(15, 23, 42, 0.06)',
  },
  cardTitle: { ...typography.heading, color: colors.text },
  cardSubtitle: { ...typography.caption, color: colors.textMuted, marginTop: -spacing.sm },
  field: { gap: spacing.xs },
  label: { ...typography.label, color: colors.text },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  inputFocused: { borderColor: colors.primary },
  inputError: { borderColor: colors.danger },
  errorText: { ...typography.caption, color: colors.danger },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  badgeOwner: { backgroundColor: colors.primary },
  badgeText: { ...typography.caption, fontWeight: '700', color: colors.primary },
  badgeOwnerText: { color: colors.onPrimary },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  action: { ...typography.label, color: colors.primary },
  actionDanger: { color: colors.danger },
  actionMuted: { ...typography.label, color: colors.textMuted },
});

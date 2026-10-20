import { useRef, useState, type ComponentPropsWithRef } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputInstance } from 'react-native';

import { describeError } from '../api/error-messages';
import { roomBookingApi } from '../api/room-booking-api';
import { MAX_BOOKED_BY_LENGTH, MAX_TITLE_LENGTH, type BookingResponse } from '../models/booking';
import type { MeetingRoom } from '../models/room';
import { colors, radius, spacing, typography } from '../theme/theme';
import { formatRange } from '../utils/date-time';
import { useRevealFocusedInput } from './KeyboardAwareScrollView';
import { PrimaryButton } from './PrimaryButton';
import { StatusMessage } from './StatusMessage';

interface BookingFormProps {
  room: MeetingRoom;
  start: Date;
  end: Date;
  onBooked: (booking: BookingResponse) => void;
  onCancel: () => void;
}

export function BookingForm({ room, start, end, onBooked, onCancel }: BookingFormProps) {
  const [title, setTitle] = useState('');
  const [bookedBy, setBookedBy] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showValidation, setShowValidation] = useState(false);
  const bookedByRef = useRef<TextInputInstance>(null);

  // Same rules as the API's BookingRequestValidator, checked before sending.
  const titleError = !title.trim() ? 'Skriv en titel på mødet.' : null;
  const bookedByError = !bookedBy.trim() ? 'Skriv hvem der booker.' : null;
  const isValid = !titleError && !bookedByError;

  const submit = async () => {
    setShowValidation(true);
    if (!isValid) return;

    setSubmitting(true);
    setError(null);
    try {
      const booking = await roomBookingApi.createBooking({
        roomId: room.id,
        title: title.trim(),
        bookedBy: bookedBy.trim(),
        startUtc: start.toISOString(),
        endUtc: end.toISOString(),
      });
      onBooked(booking);
    } catch (caught) {
      setError(describeError(caught));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.form}>
      <View>
        <Text style={styles.heading}>Book {room.name}</Text>
        <Text style={styles.subheading}>{formatRange(start, end)}</Text>
      </View>

      <LabeledInput
        label="Mødets titel"
        value={title}
        onChangeText={setTitle}
        placeholder="F.eks. Sprint planning"
        maxLength={MAX_TITLE_LENGTH}
        error={showValidation ? titleError : null}
        autoCapitalize="sentences"
        returnKeyType="next"
        // "Next" moves on to the name field and keeps the keyboard open.
        submitBehavior="submit"
        onSubmitEditing={() => bookedByRef.current?.focus()}
      />
      <LabeledInput
        ref={bookedByRef}
        label="Booket af"
        value={bookedBy}
        onChangeText={setBookedBy}
        placeholder="Dit navn"
        maxLength={MAX_BOOKED_BY_LENGTH}
        error={showValidation ? bookedByError : null}
        autoCapitalize="words"
        autoComplete="name"
        returnKeyType="done"
        onSubmitEditing={submit}
      />

      {error ? <StatusMessage variant="error" title="Bookingen blev ikke oprettet" message={error} /> : null}

      <View style={styles.actions}>
        <View style={styles.action}>
          <PrimaryButton label="Annuller" onPress={onCancel} variant="secondary" disabled={submitting} />
        </View>
        <View style={styles.action}>
          <PrimaryButton label="Bekræft booking" onPress={submit} loading={submitting} />
        </View>
      </View>
    </View>
  );
}

interface LabeledInputProps extends ComponentPropsWithRef<typeof TextInput> {
  label: string;
  error: string | null;
}

function LabeledInput({ label, error, style, ...inputProps }: LabeledInputProps) {
  const [focused, setFocused] = useState(false);
  const revealFocusedInput = useRevealFocusedInput();

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...inputProps}
        onFocus={() => {
          setFocused(true);
          // Switching fields while the keyboard is open (Android).
          revealFocusedInput();
        }}
        onBlur={() => setFocused(false)}
        placeholderTextColor={colors.textMuted}
        accessibilityLabel={label}
        style={[styles.input, focused && styles.inputFocused, error && styles.inputError, style]}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.primary,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  heading: { ...typography.heading, color: colors.text },
  subheading: { ...typography.body, color: colors.textMuted, marginTop: 2 },
  field: { gap: spacing.xs },
  label: { ...typography.label, color: colors.text },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 16, // 16px+ stops iOS Safari from zooming in on focus.
    color: colors.text,
    backgroundColor: colors.surface,
  },
  inputFocused: { borderColor: colors.primary },
  inputError: { borderColor: colors.danger },
  errorText: { ...typography.caption, color: colors.danger },
  actions: { flexDirection: 'row', gap: spacing.md },
  action: { flex: 1 },
});

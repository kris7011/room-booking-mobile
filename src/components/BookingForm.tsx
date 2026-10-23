import { useRef, useState, type ComponentPropsWithRef } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputInstance } from 'react-native';

import { describeError, isStartNotInFutureError } from '../api/error-messages';
import type { RoomBookingApi } from '../api/room-booking-api';
import { MAX_BOOKED_BY_LENGTH, MAX_TITLE_LENGTH, type BookingDraft, type BookingResponse } from '../models/booking';
import type { MeetingRoom } from '../models/room';
import { colors, radius, spacing, typography } from '../theme/theme';
import { formatRange } from '../utils/date-time';
import { useRevealFocusedInput } from './KeyboardAwareScrollView';
import { PrimaryButton } from './PrimaryButton';
import { StatusMessage } from './StatusMessage';

/** Shown once the meeting's start has passed while the form is open. */
export interface StartedBookingNotice {
  message: string;
  /** e.g. "Søg igen: I dag 10:30–11:30". */
  actionLabel: string;
}

/** What the screen provides to the booking form, whichever room is open. */
export interface BookingFormContext {
  /** Where the booking is made: the chosen organisation's API, or demo data. */
  api: RoomBookingApi;
  /** Title and name, kept by the screen so a new search does not lose them. */
  draft: BookingDraft;
  onDraftChange: (draft: BookingDraft) => void;
  /** Set when the start has passed, by the device clock or according to the server. */
  started: StartedBookingNotice | null;
  /** Searches again from the next possible time, keeping the draft. */
  onChooseNewTime: () => void;
  /** The start turned out to have passed when sending; `byServer` if the API said so. */
  onStartPassed: (byServer: boolean) => void;
}

interface BookingFormProps extends BookingFormContext {
  room: MeetingRoom;
  start: Date;
  end: Date;
  onBooked: (booking: BookingResponse) => void;
  onCancel: () => void;
}

export function BookingForm({
  api,
  room,
  start,
  end,
  draft,
  onDraftChange,
  started,
  onChooseNewTime,
  onStartPassed,
  onBooked,
  onCancel,
}: BookingFormProps) {
  const { title, bookedBy } = draft;
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
    if (!isValid || started || submitting) return;

    // The screen's clock only ticks at slot boundaries and a timer can be
    // late, so check the time again right before sending.
    if (start.getTime() <= Date.now()) {
      onStartPassed(false);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const booking = await api.createBooking({
        roomId: room.id,
        title: title.trim(),
        bookedBy: bookedBy.trim(),
        startUtc: start.toISOString(),
        endUtc: end.toISOString(),
      });
      onBooked(booking);
    } catch (caught) {
      if (isStartNotInFutureError(caught)) {
        // The server's clock says the meeting has started: show the same
        // notice as when the device notices it, not a generic error.
        onStartPassed(true);
      } else {
        setError(describeError(caught));
      }
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
        onChangeText={(text) => onDraftChange({ ...draft, title: text })}
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
        onChangeText={(text) => onDraftChange({ ...draft, bookedBy: text })}
        placeholder="Dit navn"
        maxLength={MAX_BOOKED_BY_LENGTH}
        error={showValidation ? bookedByError : null}
        autoCapitalize="words"
        autoComplete="name"
        returnKeyType="done"
        onSubmitEditing={submit}
      />

      {started ? (
        <StatusMessage
          variant="warning"
          title="Mødets starttidspunkt er passeret"
          message={`${started.message} Bookingen kan ikke bekræftes. Vælg et nyt tidspunkt – titel og navn bliver bevaret.`}
          actionLabel={started.actionLabel}
          onAction={onChooseNewTime}
        />
      ) : error ? (
        <StatusMessage variant="error" title="Bookingen blev ikke oprettet" message={error} />
      ) : null}

      <View style={styles.actions}>
        <View style={styles.action}>
          <PrimaryButton label="Annuller" onPress={onCancel} variant="secondary" disabled={submitting} />
        </View>
        <View style={styles.action}>
          <PrimaryButton label="Bekræft booking" onPress={submit} loading={submitting} disabled={started !== null} />
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

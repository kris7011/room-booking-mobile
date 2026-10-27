import { useRef, useState, type ComponentPropsWithRef } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputInstance } from 'react-native';

import { UNCERTAIN_BOOKING_TITLE, type BookingSubmission } from '../bookings/booking-submission';
import { MAX_BOOKED_BY_LENGTH, MAX_TITLE_LENGTH, type BookingDraft, type SaveBookingRequest } from '../models/booking';
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
  /**
   * The booking being sent, or the last one whose answer was lost or
   * refused. Kept by the screen with its Idempotency-Key, so closing the
   * form or searching again does not lose a booking that may exist.
   */
  submission: BookingSubmission;
  /** Sends the booking (a retry if it is exactly the pending one). */
  onConfirm: (request: SaveBookingRequest) => void;
  /** Sends the pending booking again, unchanged, with the same key. */
  onRetry: () => void;
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
  /** The search inputs changed after this booking window was fetched. */
  outdated: boolean;
  start: Date;
  end: Date;
  onCancel: () => void;
}

export function BookingForm({
  submission,
  onConfirm,
  onRetry,
  room,
  outdated,
  start,
  end,
  draft,
  onDraftChange,
  started,
  onChooseNewTime,
  onStartPassed,
  onCancel,
}: BookingFormProps) {
  const { title, bookedBy } = draft;
  const [showValidation, setShowValidation] = useState(false);
  const submitting = submission.status === 'sending';
  // Shown in this form only when they concern this room.
  const uncertain = submission.status === 'uncertain' && submission.attempt.request.roomId === room.id ? submission : null;
  const error = submission.status === 'failed' && submission.roomId === room.id ? submission.message : null;
  const bookedByRef = useRef<TextInputInstance>(null);

  // Same rules as the API's BookingRequestValidator, checked before sending.
  const titleError = !title.trim() ? 'Skriv en titel på mødet.' : null;
  const bookedByError = !bookedBy.trim() ? 'Skriv hvem der booker.' : null;
  const isValid = !titleError && !bookedByError;

  const submit = () => {
    setShowValidation(true);
    if (!isValid || started || outdated || submitting) return;

    // The screen's clock only ticks at slot boundaries and a timer can be
    // late, so check the time again right before sending.
    if (start.getTime() <= Date.now()) {
      onStartPassed(false);
      return;
    }

    onConfirm({
      roomId: room.id,
      title: title.trim(),
      bookedBy: bookedBy.trim(),
      startUtc: start.toISOString(),
      endUtc: end.toISOString(),
    });
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

      {uncertain ? (
        // First: a booking that may exist matters more than a passed start.
        <StatusMessage
          variant="warning"
          title={UNCERTAIN_BOOKING_TITLE}
          message={uncertain.message}
          actionLabel="Prøv igen"
          onAction={onRetry}
        />
      ) : started ? (
        <StatusMessage
          variant="warning"
          title="Mødets starttidspunkt er passeret"
          message={`${started.message} Bookingen kan ikke bekræftes. Vælg et nyt tidspunkt – titel og navn bliver bevaret.`}
          actionLabel={started.actionLabel}
          onAction={onChooseNewTime}
        />
      ) : outdated ? (
        <StatusMessage
          variant="warning"
          title="Søg igen før booking"
          message="Søgetidspunktet eller antal deltagere er ændret. Søg igen, før du kan bekræfte en booking. Titel og navn bevares."
        />
      ) : error ? (
        <StatusMessage variant="error" title="Bookingen blev ikke oprettet" message={error} />
      ) : null}

      <View style={styles.actions}>
        <View style={styles.action}>
          <PrimaryButton label="Annuller" onPress={onCancel} variant="secondary" disabled={submitting} />
        </View>
        <View style={styles.action}>
          <PrimaryButton label="Bekræft booking" onPress={submit} loading={submitting} disabled={started !== null || outdated} />
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

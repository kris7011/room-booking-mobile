import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { describeError } from '../api/error-messages';
import type { RoomBookingApi } from '../api/room-booking-api';
import {
  IDLE_SUBMISSION,
  UNCERTAIN_BOOKING_TITLE,
  attemptFor,
  pendingAttempt,
  sendBooking,
  settle,
  type BookingAttempt,
  type BookingSubmission,
} from '../bookings/booking-submission';
import { isDemoMode } from '../config/env';
import { useClock } from '../hooks/useClock';
import { EMPTY_BOOKING_DRAFT, type BookingDraft, type BookingResponse, type SaveBookingRequest } from '../models/booking';
import type { LoadState } from '../models/load-state';
import type { MeetingRoom } from '../models/room';
import type { SearchCriteria, SearchWindow } from '../models/search-criteria';
import { spacing } from '../theme/theme';
import { atMinutes, formatRange } from '../utils/date-time';
import { checkSearchWindow, describeStartedWindow, hasStarted, resolveSearchWindow } from '../utils/search-window';
import { AllRoomsList } from './AllRoomsList';
import type { StartedBookingNotice } from './BookingForm';
import { SearchForm } from './SearchForm';
import { SearchResults } from './SearchResults';
import { StatusMessage } from './StatusMessage';
import { UpcomingBookings } from './UpcomingBookings';

const DEFAULT_PARTICIPANTS = 4;

interface BookingAreaProps {
  /**
   * The rooms and bookings of one organisation (or demo data). The screen
   * gives this component a new `key` for every organisation, so nothing
   * here (results, the open form, the draft) survives a switch.
   */
  api: RoomBookingApi;
  /** Shown above the room overview, e.g. "Mødelokaler i Acme". */
  roomsTitle?: string;
  /**
   * The user's role in the organisation. When it changes, the upcoming
   * bookings (whose delete actions depend on it) are fetched again; the
   * search and the draft stay.
   */
  role?: string;
}

export function BookingArea({ api, roomsTitle, role }: BookingAreaProps) {
  // Renewed every half hour, at midnight and when the app returns from the
  // background, so the default time, "I dag"/"I morgen" and the validation
  // below stay current while the app is left open.
  const { now, refresh: refreshClock } = useClock();
  const [participants, setParticipants] = useState(DEFAULT_PARTICIPANTS);
  // null: follow the clock. Set as soon as the user picks a day or time, and
  // never changed automatically after that.
  const [chosenWindow, setChosenWindow] = useState<SearchWindow | null>(null);
  const searchWindow = useMemo(() => resolveSearchWindow(chosenWindow, now), [chosenWindow, now]);
  const criteria: SearchCriteria = { ...searchWindow, participants };

  const [allRooms, setAllRooms] = useState<LoadState<MeetingRoom[]>>({ status: 'idle' });
  const [search, setSearch] = useState<LoadState<MeetingRoom[]>>({ status: 'idle' });
  // Results always describe the criteria they were fetched for, even if the
  // user has started editing the form since.
  const [searchedCriteria, setSearchedCriteria] = useState<SearchCriteria | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
  const [lastBooking, setLastBooking] = useState<BookingResponse | null>(null);
  // Lives here, not in the booking form, so a new search (e.g. for a new
  // time after the old one passed) does not lose what the user typed.
  const [bookingDraft, setBookingDraft] = useState<BookingDraft>(EMPTY_BOOKING_DRAFT);
  // The API rejected the searched start as not in the future, although the
  // device clock may still think it is (a clock that is behind).
  const [startRejectedByServer, setStartRejectedByServer] = useState(false);
  // Bumped after a booking, so the list of upcoming bookings reloads.
  const [bookingsVersion, setBookingsVersion] = useState(0);
  // The booking being sent, or one whose answer was lost, with its
  // Idempotency-Key. Lives here, not in the form, so closing the form or a
  // new search keeps the key for a safe retry. A new organisation means a
  // new BookingArea, and with it a new key.
  const [submission, setSubmission] = useState<BookingSubmission>(IDLE_SUBMISSION);

  // Lets us ignore a slow response that arrives after a newer search started.
  const latestSearchId = useRef(0);

  const loadAllRooms = useCallback(async () => {
    setAllRooms({ status: 'loading' });
    try {
      setAllRooms({ status: 'success', data: await api.getRooms() });
    } catch (error) {
      setAllRooms({ status: 'error', message: describeError(error) });
    }
  }, [api]);

  // Runs after the first render: fetch the room overview.
  useEffect(() => {
    void loadAllRooms();
  }, [loadAllRooms]);

  const started = checkSearchWindow(searchWindow, now);

  /** `reopenRoomId`: open that room's booking form again if it is still free. */
  const runSearch = async (searchFor: SearchCriteria, reopenRoomId: number | null = null) => {
    const searchId = ++latestSearchId.current;
    setSearchedCriteria(searchFor);
    setSelectedRoomId(null);
    setStartRejectedByServer(false);
    setSearch({ status: 'loading' });

    try {
      const rooms = await api.getAvailableRooms({
        startUtc: atMinutes(searchFor.day, searchFor.startMinutes).toISOString(),
        endUtc: atMinutes(searchFor.day, searchFor.endMinutes).toISOString(),
        minCapacity: searchFor.participants,
      });
      if (searchId === latestSearchId.current) {
        setSearch({ status: 'success', data: rooms });
        if (reopenRoomId !== null && rooms.some((room) => room.id === reopenRoomId)) {
          setSelectedRoomId(reopenRoomId);
        }
      }
    } catch (error) {
      if (searchId === latestSearchId.current) {
        setSearch({ status: 'error', message: describeError(error) });
      }
    }
  };

  // A refusal belongs to the form it was shown in; an uncertain booking is
  // kept until it is resolved.
  const clearFailure = () => setSubmission((current) => (current.status === 'failed' ? IDLE_SUBMISSION : current));

  const handleSearch = () => {
    // The clock may lag behind if timers were delayed. Never search for a time
    // that has started; show the current state instead.
    if (hasStarted(searchWindow, new Date())) {
      refreshClock();
      return;
    }
    setLastBooking(null);
    clearFailure();
    void runSearch(criteria);
  };

  const handleSelectRoom = (roomId: number | null) => {
    clearFailure();
    setSelectedRoomId(roomId);
  };

  const handleCriteriaChange = ({ participants: nextParticipants, ...windowChanges }: Partial<SearchCriteria>) => {
    if (nextParticipants !== undefined) setParticipants(nextParticipants);
    if (Object.keys(windowChanges).length > 0) setChosenWindow({ ...searchWindow, ...windowChanges });
  };

  const handleBooked = (booking: BookingResponse) => {
    setLastBooking(booking);
    setBookingDraft(EMPTY_BOOKING_DRAFT);
    setBookingsVersion((version) => version + 1);
    // Refresh availability so the booked room disappears from the results.
    if (searchedCriteria) void runSearch(searchedCriteria);
  };

  // An open booking form keeps the search it was made for. Once that start
  // has passed (or the server says so), confirming is blocked and the form
  // offers to search again from the next possible time.
  const bookingStarted =
    searchedCriteria && (startRejectedByServer || hasStarted(searchedCriteria, now))
      ? describeStartedWindow(searchedCriteria, now)
      : null;
  const bookingNotice: StartedBookingNotice | null = bookingStarted && {
    message:
      startRejectedByServer && searchedCriteria && !hasStarted(searchedCriteria, now)
        ? `${bookingStarted.message} Serveren afviste bookingen – telefonens ur går muligvis forkert.`
        : bookingStarted.message,
    actionLabel: `Søg igen: ${bookingStarted.suggestionLabel}`,
  };

  const handleStartPassed = (byServer: boolean) => {
    if (byServer) setStartRejectedByServer(true);
    // The clock may lag behind the moment the start passed.
    refreshClock();
  };

  const send = async (attempt: BookingAttempt) => {
    setSubmission({ status: 'sending', attempt });
    const outcome = await sendBooking(api, attempt);
    // Only the attempt being sent may change what is shown.
    setSubmission((current) => (pendingAttempt(current) === attempt ? settle(attempt, outcome) : current));

    switch (outcome.status) {
      case 'booked':
        handleBooked(outcome.booking);
        break;
      case 'start-passed':
        // The server checks the key before the time: nothing was booked.
        if (searchedCriteria && attempt.request.startUtc === atMinutes(searchedCriteria.day, searchedCriteria.startMinutes).toISOString()) {
          handleStartPassed(true);
        } else {
          setSubmission({
            status: 'failed',
            roomId: attempt.request.roomId,
            message: 'Mødets starttidspunkt er passeret ifølge serveren. Bookingen blev ikke oprettet.',
          });
        }
        break;
      case 'uncertain':
        // The list of upcoming bookings may already show it.
        setBookingsVersion((version) => version + 1);
        break;
    }
  };

  const handleConfirm = (request: SaveBookingRequest) => {
    if (submission.status === 'sending') return;
    // The same request again keeps its key; anything else is a new booking.
    void send(attemptFor(request, pendingAttempt(submission)));
  };

  const handleRetry = () => {
    if (submission.status === 'uncertain') void send(submission.attempt);
  };

  const uncertainAttempt = submission.status === 'uncertain' ? submission.attempt : null;
  // The open booking form shows it; otherwise it is shown here, so a closed
  // form or a new search does not hide a booking that may exist.
  const formShowsUncertain =
    uncertainAttempt !== null &&
    search.status === 'success' &&
    selectedRoomId === uncertainAttempt.request.roomId &&
    search.data.some((room) => room.id === uncertainAttempt.request.roomId);

  const handleChooseNewTime = () => {
    if (!searchedCriteria || !bookingStarted) return;
    const next: SearchCriteria = { ...bookingStarted.suggestion, participants: searchedCriteria.participants };
    // The search form shows the new time as the user's choice.
    setChosenWindow(bookingStarted.suggestion);
    setParticipants(next.participants);
    setLastBooking(null);
    void runSearch(next, selectedRoomId);
  };

  const searched = searchedCriteria && {
    start: atMinutes(searchedCriteria.day, searchedCriteria.startMinutes),
    end: atMinutes(searchedCriteria.day, searchedCriteria.endMinutes),
    participants: searchedCriteria.participants,
  };

  // The picker follows the clock until the user selects a day or time,
  // whereas fetched results deliberately keep the criteria used for that search.
  // Explicitly label that difference so a previously found slot is not mistaken
  // for availability at the newly displayed time or participant count.
  const showingPreviousSearch =
    searchedCriteria !== null &&
    search.status === 'success' &&
    (searchedCriteria.day.getTime() !== searchWindow.day.getTime() ||
      searchedCriteria.startMinutes !== searchWindow.startMinutes ||
      searchedCriteria.endMinutes !== searchWindow.endMinutes ||
      searchedCriteria.participants !== participants);

  return (
    <View style={styles.area}>
      <SearchForm
        criteria={criteria}
        today={now}
        onChange={handleCriteriaChange}
        onSearch={handleSearch}
        searching={search.status === 'loading'}
        started={started}
        onUseSuggestion={() => started && setChosenWindow(started.suggestion)}
      />

      {lastBooking ? (
        <StatusMessage
          variant="success"
          title={isDemoMode ? 'Demo-booking oprettet (ikke gemt)' : 'Booking oprettet'}
          message={`${lastBooking.title} i ${lastBooking.roomName}, ${formatRange(
            new Date(lastBooking.startUtc),
            new Date(lastBooking.endUtc),
          )}. Booking nr. ${lastBooking.id}.`}
        />
      ) : null}

      {submission.status === 'uncertain' && !formShowsUncertain ? (
        <StatusMessage
          variant="warning"
          title={UNCERTAIN_BOOKING_TITLE}
          message={`"${submission.attempt.request.title}", ${formatRange(
            new Date(submission.attempt.request.startUtc),
            new Date(submission.attempt.request.endUtc),
          )}. ${submission.message}`}
          actionLabel="Prøv igen"
          onAction={handleRetry}
        />
      ) : null}

      {showingPreviousSearch && searched ? (
        <StatusMessage
          variant="warning"
          title="Resultater fra tidligere søgning"
          message={`De viste lokaler gælder stadig for ${formatRange(searched.start, searched.end)} med ${searched.participants} deltagere. Søgefelterne viser nu andre valg. Du kan først booke, når du har søgt igen for det nye tidspunkt og antal deltagere.`}
        />
      ) : null}

      {searched ? (
        <SearchResults
          state={search}
          start={searched.start}
          end={searched.end}
          participants={searched.participants}
          selectedRoomId={selectedRoomId}
          outdated={showingPreviousSearch}
          onSelectRoom={handleSelectRoom}
          onRetry={() => {
            if (searchedCriteria) void runSearch(searchedCriteria);
          }}
          bookingForm={{
            submission,
            onConfirm: handleConfirm,
            onRetry: handleRetry,
            draft: bookingDraft,
            onDraftChange: setBookingDraft,
            started: bookingNotice,
            onChooseNewTime: handleChooseNewTime,
            onStartPassed: handleStartPassed,
          }}
        />
      ) : (
        <AllRoomsList state={allRooms} onRetry={() => void loadAllRooms()} title={roomsTitle} />
      )}

      {api.listBookings ? <UpcomingBookings key={role ?? 'no-role'} api={api} now={now} version={bookingsVersion} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  area: { gap: spacing.xl },
});

import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { describeError } from '../api/error-messages';
import { roomBookingApi } from '../api/room-booking-api';
import { AllRoomsList } from '../components/AllRoomsList';
import { ApiModeBanner } from '../components/ApiModeBanner';
import { KeyboardAwareScrollView } from '../components/KeyboardAwareScrollView';
import { SearchForm } from '../components/SearchForm';
import { SearchResults } from '../components/SearchResults';
import { StatusMessage } from '../components/StatusMessage';
import { isDemoMode } from '../config/env';
import type { BookingResponse } from '../models/booking';
import type { LoadState } from '../models/load-state';
import type { MeetingRoom } from '../models/room';
import type { SearchCriteria } from '../models/search-criteria';
import { colors, spacing, typography } from '../theme/theme';
import { atMinutes, defaultSearchWindow, formatRange } from '../utils/date-time';

const DEFAULT_PARTICIPANTS = 4;

export function HomeScreen() {
  // The lazy initializer runs once, so "today" stays stable across re-renders.
  const [today] = useState(() => new Date());
  const [criteria, setCriteria] = useState<SearchCriteria>(() => ({
    ...defaultSearchWindow(today),
    participants: DEFAULT_PARTICIPANTS,
  }));

  const [allRooms, setAllRooms] = useState<LoadState<MeetingRoom[]>>({ status: 'idle' });
  const [search, setSearch] = useState<LoadState<MeetingRoom[]>>({ status: 'idle' });
  // Results always describe the criteria they were fetched for, even if the
  // user has started editing the form since.
  const [searchedCriteria, setSearchedCriteria] = useState<SearchCriteria | null>(null);
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
  const [lastBooking, setLastBooking] = useState<BookingResponse | null>(null);

  // Lets us ignore a slow response that arrives after a newer search started.
  const latestSearchId = useRef(0);

  const loadAllRooms = useCallback(async () => {
    setAllRooms({ status: 'loading' });
    try {
      setAllRooms({ status: 'success', data: await roomBookingApi.getRooms() });
    } catch (error) {
      setAllRooms({ status: 'error', message: describeError(error) });
    }
  }, []);

  // Runs once after the first render: fetch the room overview.
  useEffect(() => {
    void loadAllRooms();
  }, [loadAllRooms]);

  const start = atMinutes(criteria.day, criteria.startMinutes);
  const end = atMinutes(criteria.day, criteria.endMinutes);
  const validationMessage = start.getTime() <= Date.now() ? 'Starttidspunktet er allerede passeret. Vælg et senere tidspunkt.' : null;

  const runSearch = async (searchFor: SearchCriteria) => {
    const searchId = ++latestSearchId.current;
    setSearchedCriteria(searchFor);
    setSelectedRoomId(null);
    setSearch({ status: 'loading' });

    try {
      const rooms = await roomBookingApi.getAvailableRooms({
        startUtc: atMinutes(searchFor.day, searchFor.startMinutes).toISOString(),
        endUtc: atMinutes(searchFor.day, searchFor.endMinutes).toISOString(),
        minCapacity: searchFor.participants,
      });
      if (searchId === latestSearchId.current) {
        setSearch({ status: 'success', data: rooms });
      }
    } catch (error) {
      if (searchId === latestSearchId.current) {
        setSearch({ status: 'error', message: describeError(error) });
      }
    }
  };

  const handleSearch = () => {
    setLastBooking(null);
    void runSearch(criteria);
  };

  const handleCriteriaChange = (changes: Partial<SearchCriteria>) => {
    setCriteria((current) => ({ ...current, ...changes }));
  };

  const handleBooked = (booking: BookingResponse) => {
    setLastBooking(booking);
    // Refresh availability so the booked room disappears from the results.
    if (searchedCriteria) void runSearch(searchedCriteria);
  };

  const searched = searchedCriteria && {
    start: atMinutes(searchedCriteria.day, searchedCriteria.startMinutes),
    end: atMinutes(searchedCriteria.day, searchedCriteria.endMinutes),
    participants: searchedCriteria.participants,
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* Keeps the booking form's inputs above the keyboard, also on Android. */}
      <KeyboardAwareScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.column}>
          <View style={styles.header}>
            <Text style={styles.eyebrow}>Room Booking</Text>
            <Text style={styles.title}>Find et ledigt mødelokale</Text>
            <Text style={styles.subtitle}>Vælg antal deltagere og tidspunkt, så finder vi de lokaler, der passer.</Text>
          </View>

          <ApiModeBanner />

          <SearchForm
            criteria={criteria}
            today={today}
            onChange={handleCriteriaChange}
            onSearch={handleSearch}
            searching={search.status === 'loading'}
            validationMessage={validationMessage}
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

          {searched ? (
            <SearchResults
              state={search}
              start={searched.start}
              end={searched.end}
              participants={searched.participants}
              selectedRoomId={selectedRoomId}
              onSelectRoom={setSelectedRoomId}
              onRetry={() => {
                if (searchedCriteria) void runSearch(searchedCriteria);
              }}
              onBooked={handleBooked}
            />
          ) : (
            <AllRoomsList state={allRooms} onRetry={() => void loadAllRooms()} />
          )}
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  scrollContent: { padding: spacing.lg, paddingBottom: spacing.xxl },
  // Keeps the layout readable on tablets and wide browser windows.
  column: { width: '100%', maxWidth: 640, alignSelf: 'center', gap: spacing.xl },
  header: { gap: spacing.xs, paddingTop: spacing.sm },
  eyebrow: { ...typography.label, color: colors.primary, textTransform: 'uppercase', letterSpacing: 1 },
  title: { ...typography.title, color: colors.text },
  subtitle: { ...typography.body, color: colors.textMuted },
});

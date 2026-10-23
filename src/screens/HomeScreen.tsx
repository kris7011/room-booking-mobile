import { useMemo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { roomBookingApi, roomBookingApiFor } from '../api/room-booking-api';
import { useAuth } from '../auth/AuthProvider';
import { AccountPanel } from '../components/AccountPanel';
import { ApiModeBanner } from '../components/ApiModeBanner';
import { BookingArea } from '../components/BookingArea';
import { KeyboardAwareScrollView } from '../components/KeyboardAwareScrollView';
import { OrganizationPanel } from '../components/organizations/OrganizationPanel';
import { isDemoMode } from '../config/env';
import { useSession } from '../organizations/SessionProvider';
import { colors, spacing, typography } from '../theme/theme';

export function HomeScreen({ onOpenAdmin }: { onOpenAdmin: () => void }) {
  const { state } = useAuth();
  const { identity, organizations } = useSession();
  const active = organizations.status === 'ready' ? organizations.active : null;
  const activeId = active?.publicId ?? null;
  // One API object per organisation, so the booking area only reloads when
  // the organisation changes.
  const organizationApi = useMemo(() => (activeId ? roomBookingApiFor(activeId) : null), [activeId]);

  let booking: ReactNode = null;
  if (isDemoMode || state.status !== 'signed-in') {
    // Demo data, or the original endpoints without a token. A real API
    // answers 401 there unless it runs in its anonymous demo mode.
    booking = <BookingArea key="no-organization" api={roomBookingApi} />;
  } else if (identity?.status === 'registered') {
    // Keyed by the organisation: switching starts the search, results and
    // forms afresh, so nothing of the previous organisation stays visible.
    if (active && organizationApi) {
      booking = <BookingArea key={active.publicId} api={organizationApi} roomsTitle={`Mødelokaler i ${active.name}`} />;
    }
  } else if (identity && identity.status !== 'checking' && identity.status !== 'registering') {
    // An API without registration or organisations: the original endpoints.
    booking = <BookingArea key="no-organization" api={roomBookingApi} />;
  }

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

          <AccountPanel />

          <OrganizationPanel onOpenAdmin={onOpenAdmin} />

          {booking}
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

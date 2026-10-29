import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { sessionWarningToShow, type ServerIdentity } from '../api/current-user';
import type { RegisteredUser } from '../models/current-user';
import { describeAccount, describeSignInChoice, SIGN_IN_LABELS } from '../auth/account-description';
import { describeUnavailable } from '../auth/auth-availability';
import { useAuth } from '../auth/AuthProvider';
import type { AuthProviderId } from '../auth/id-token';
import { apiBaseUrl, isDemoMode } from '../config/env';
import { useSession } from '../organizations/SessionProvider';
import { colors, radius, spacing, typography } from '../theme/theme';
import { PrimaryButton } from './PrimaryButton';

// Login status, the login buttons (Microsoft, and e-mail code when it is
// configured) and logout. The organisations the user belongs to are shown by
// the OrganizationPanel below it.
export function AccountPanel() {
  const { state, providers, signIn, signOut } = useAuth();
  const { identity, recheckIdentity: recheck } = useSession();
  // Which button started the running login, so only that one spins.
  const [chosen, setChosen] = useState<AuthProviderId>('entra');

  if (state.status === 'unavailable') {
    return (
      <View style={[styles.panel, styles.muted]} testID="account-panel">
        <Text style={styles.caption}>{describeUnavailable(state.reason, state.detail)}</Text>
      </View>
    );
  }

  if (state.status === 'restoring') {
    return (
      <View style={[styles.panel, styles.row]} testID="account-panel">
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.caption}>Henter login…</Text>
      </View>
    );
  }

  if (state.status === 'signed-in') {
    const warning = sessionWarningToShow(state.warning, identity);
    return (
      <View style={styles.panel} testID="account-panel">
        <Text style={styles.label}>{describeAccount(state.user)}</Text>
        <Text style={styles.name}>{state.user.name}</Text>
        {state.user.username ? <Text style={styles.caption}>{state.user.username}</Text> : null}
        <ServerIdentityLine identity={identity} onRetry={recheck} />
        {warning ? (
          <Text style={[styles.caption, styles.warning]} accessibilityLiveRegion="polite">
            {warning}
          </Text>
        ) : null}
        <PrimaryButton label="Log ud" onPress={signOut} variant="secondary" />
      </View>
    );
  }

  // signed-out or signing-in
  const notice = state.status === 'signed-out' ? state.notice : undefined;
  return (
    <View style={styles.panel} testID="account-panel">
      <Text style={styles.label}>Ikke logget ind</Text>
      <Text style={styles.caption}>{describeSignInChoice(providers, isDemoMode)}</Text>
      {notice ? (
        <Text
          style={[styles.caption, notice.kind === 'error' ? styles.error : null]}
          accessibilityRole={notice.kind === 'error' ? 'alert' : undefined}
          accessibilityLiveRegion="polite"
        >
          {notice.message}
        </Text>
      ) : null}
      {providers.map((provider, index) => (
        <PrimaryButton
          key={provider}
          label={SIGN_IN_LABELS[provider]}
          variant={index === 0 ? 'primary' : 'secondary'}
          onPress={() => {
            setChosen(provider);
            signIn(provider);
          }}
          loading={state.status === 'signing-in' && chosen === provider}
          disabled={state.status === 'signing-in'}
        />
      ))}
    </View>
  );
}

function ServerIdentityLine({ identity, onRetry }: { identity: ServerIdentity | null; onRetry: () => void }) {
  if (identity === null) {
    // Demo mode: there is no API to confirm the identity.
    return <Text style={styles.caption}>Demotilstand: identiteten er ikke bekræftet af et API.</Text>;
  }
  switch (identity.status) {
    case 'checking':
      return <Text style={styles.caption}>Bekræfter login hos API'et…</Text>;
    case 'registering':
      return (
        <View style={styles.row}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.caption}>Bekræftet af API'et. Opretter dig som bruger i Room Booking…</Text>
        </View>
      );
    case 'registered':
      return <RegisteredUserSummary user={identity.user} registeredNow={identity.registeredNow} />;
    case 'registration-unsupported':
      return (
        <Text style={styles.caption}>
          Bekræftet af API'et som {identity.identity.displayName}, men API'et understøtter endnu ikke registrering af
          brugere (/api/me/registration mangler).
        </Text>
      );
    case 'registration-failed':
      return (
        <View style={styles.row}>
          <Text style={[styles.caption, styles.error, styles.flex]}>
            Bekræftet af API'et, men du kunne ikke oprettes som bruger i Room Booking. {identity.message}
          </Text>
          <Text style={styles.link} accessibilityRole="button" onPress={onRetry}>
            Prøv igen
          </Text>
        </View>
      );
    case 'unsupported':
      return <Text style={styles.caption}>API'et understøtter endnu ikke login (/api/me mangler).</Text>;
    case 'not-configured':
      return <Text style={styles.caption}>API'et er ikke sat op til Microsoft-login.</Text>;
    case 'insecure-transport':
      return (
        <Text style={[styles.caption, styles.warning]}>
          Login-tokenet sendes ikke til {apiBaseUrl}, fordi forbindelsen ikke er sikker. Brug HTTPS, eller i udvikling
          localhost via adb reverse (se README).
        </Text>
      );
    case 'rejected':
    case 'error':
      return (
        <View style={styles.row}>
          <Text style={[styles.caption, styles.error, styles.flex]}>{identity.message}</Text>
          <Text style={styles.link} accessibilityRole="button" onPress={onRetry}>
            Prøv igen
          </Text>
        </View>
      );
  }
}

// Registered: says so plainly and shows the user ID an operator needs. The
// organisations are in the OrganizationPanel.
function RegisteredUserSummary({ user, registeredNow }: { user: RegisteredUser; registeredNow: boolean }) {
  return (
    <View style={styles.registered} testID="registration-status">
      <Text style={[styles.caption, styles.success]} accessibilityLiveRegion="polite">
        {registeredNow
          ? `✓ Du er nu registreret i Room Booking som ${user.displayName}.`
          : `✓ Registreret i Room Booking som ${user.displayName}.`}
      </Text>
      <Text style={styles.caption} selectable>
        Bruger-ID: {user.publicId}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  muted: { backgroundColor: colors.surfaceMuted, borderWidth: 0, paddingVertical: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  label: { ...typography.label, color: colors.textMuted },
  name: { ...typography.heading, color: colors.text },
  caption: { ...typography.caption, color: colors.text },
  success: { color: colors.success },
  warning: { color: colors.warning },
  error: { color: colors.danger },
  link: { ...typography.label, color: colors.primary },
  registered: { gap: spacing.sm },
});

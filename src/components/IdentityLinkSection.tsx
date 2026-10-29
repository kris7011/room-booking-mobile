import { useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { describeError } from '../api/error-messages';
import { identityLinksApi } from '../api/identity-links-api';
import { describeLinkedIdentity, IdentityLinkFlow, LINK_LABELS } from '../auth/identity-link-flow';
import { useAuth } from '../auth/AuthProvider';
import { colors, spacing, typography } from '../theme/theme';
import { PrimaryButton } from './PrimaryButton';

// Adds another way to sign in to the signed-in, registered user: the user
// signs in with the other login in the browser, then confirms here with both
// in view. The steps and their rules are in identity-link-flow.ts.
export function IdentityLinkSection({ accountName }: { accountName: string }) {
  const { providers, proveIdentity } = useAuth();
  // One flow per mounted section; proveIdentity always calls the app's single AuthController.
  const [flow] = useState(() => new IdentityLinkFlow({ api: identityLinksApi, proveIdentity, describeError }));
  const state = useSyncExternalStore(flow.subscribe, flow.getState, flow.getState);

  return (
    <View style={styles.section} testID="identity-link">
      <Text style={styles.label}>Flere måder at logge ind</Text>

      {state.step === 'idle' ? (
        <>
          <Text style={styles.caption}>
            Tilføj et andet login til {accountName}. Du logger ind med det i browseren og bekræfter bagefter her. Konti
            kædes aldrig sammen automatisk, heller ikke ved samme e-mailadresse.
          </Text>
          {state.notice ? (
            <Text
              style={[styles.caption, state.notice.kind === 'error' ? styles.error : null]}
              accessibilityLiveRegion="polite"
            >
              {state.notice.message}
            </Text>
          ) : null}
          {providers.map((provider) => (
            <PrimaryButton key={provider} label={LINK_LABELS[provider]} variant="secondary" onPress={() => void flow.begin(provider)} />
          ))}
        </>
      ) : null}

      {state.step === 'working' ? (
        <View style={styles.row}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.caption}>{state.message}</Text>
        </View>
      ) : null}

      {state.step === 'confirm' ? (
        <>
          <Text style={styles.caption} accessibilityLiveRegion="polite">
            Vil du tilknytte {state.newIdentity.username ?? state.newIdentity.name} (
            {state.newIdentity.provider === 'external-id' ? 'e-mail-kode' : 'Microsoft-konto'}) til Room Booking-kontoen{' '}
            {state.accountName}? Bagefter kan du logge ind med begge og ser de samme organisationer og bookinger.
          </Text>
          <PrimaryButton label="Tilknyt" onPress={() => void flow.confirm()} />
          <PrimaryButton label="Annuller" variant="secondary" onPress={() => void flow.decline()} />
        </>
      ) : null}

      {state.step === 'done' ? (
        <>
          <Text style={[styles.caption, styles.success]} accessibilityLiveRegion="polite">
            ✓ Tilknyttet. Du kan nu logge ind med:
          </Text>
          {state.identities.map((identity) => (
            <Text key={`${identity.provider}-${identity.createdUtc}`} style={styles.caption}>
              • {describeLinkedIdentity(identity)}
            </Text>
          ))}
          <PrimaryButton label="OK" variant="secondary" onPress={() => flow.reset()} />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm, paddingTop: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  label: { ...typography.label, color: colors.textMuted },
  caption: { ...typography.caption, color: colors.text },
  success: { color: colors.success },
  error: { color: colors.danger },
});

import { useEffect, useState } from 'react';
import { BackHandler, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InvitationsSection } from '../components/admin/InvitationsSection';
import { MembersSection } from '../components/admin/MembersSection';
import { OrganizationInfoSection } from '../components/admin/OrganizationInfoSection';
import { RoomsSection } from '../components/admin/RoomsSection';
import { KeyboardAwareScrollView } from '../components/KeyboardAwareScrollView';
import { LinkButton } from '../components/ui';
import type { Organization } from '../models/organization';
import { useSession } from '../organizations/SessionProvider';
import { colors, spacing, typography } from '../theme/theme';

/**
 * Administration of the active organisation, for Owners and Admins:
 * details, rooms, members and invitations. The API checks every action
 * itself; this page only leaves out what the role cannot do.
 */
export function OrganizationAdminScreen({ organization, onBack }: { organization: Organization; onBack: () => void }) {
  const { controller } = useSession();
  // Bumped when rooms or members change, so the counts reload.
  const [version, setVersion] = useState(0);
  const changed = () => setVersion((value) => value + 1);

  // Android's back button and gesture return to the booking page.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onBack();
      return true;
    });
    return () => subscription.remove();
  }, [onBack]);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <KeyboardAwareScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.column}>
          <View style={styles.header}>
            <LinkButton label="‹ Tilbage til booking" onPress={onBack} />
            <Text style={styles.eyebrow}>Administrer organisation</Text>
            <Text style={styles.title}>{organization.name}</Text>
          </View>

          <OrganizationInfoSection organization={organization} version={version} onRenamed={(renamed) => controller.updated(renamed)} />

          <RoomsSection organization={organization} onChanged={changed} />

          <InvitationsSection organization={organization} />

          <MembersSection
            organization={organization}
            onChanged={changed}
            // A new role for the user (handing over ownership) can take this
            // page away from them: reload, and the app follows the new role.
            onOwnRoleChanged={() => void controller.refresh(organization.publicId)}
            onLeft={() => {
              controller.removed(organization.publicId);
              onBack();
            }}
          />
        </View>
      </KeyboardAwareScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  scrollContent: { padding: spacing.lg, paddingBottom: spacing.xxl },
  column: { width: '100%', maxWidth: 640, alignSelf: 'center', gap: spacing.xl },
  header: { gap: spacing.xs, paddingTop: spacing.sm },
  eyebrow: { ...typography.label, color: colors.primary, textTransform: 'uppercase', letterSpacing: 1, marginTop: spacing.sm },
  title: { ...typography.title, color: colors.text },
});

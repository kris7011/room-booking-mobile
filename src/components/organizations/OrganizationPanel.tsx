import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { describeOrganizationAccess } from '../../api/current-user';
import type { Organization } from '../../models/organization';
import { describeOrganizationNotice } from '../../organizations/organization-messages';
import { canAdminister } from '../../organizations/permissions';
import { useSession } from '../../organizations/SessionProvider';
import { colors, spacing, typography } from '../../theme/theme';
import { Chip } from '../Chip';
import { StatusMessage } from '../StatusMessage';
import { Card, LinkButton, PrimaryButton, RoleBadge, uiStyles } from '../ui';
import { AcceptInvitationForm } from './AcceptInvitationForm';
import { CreateOrganizationForm } from './CreateOrganizationForm';

type Form = 'create' | 'accept' | null;

/**
 * The organisation the app works in, with the user's role, a switcher for
 * their other organisations and the way to create or join one. Without any
 * organisation it is the onboarding.
 */
export function OrganizationPanel({ onOpenAdmin }: { onOpenAdmin: () => void }) {
  const { identity, organizations, controller, pendingInvitationToken, clearPendingInvitation } = useSession();
  const [form, setForm] = useState<Form>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // An invitation link opened the app: show the form with its code.
  useEffect(() => {
    if (pendingInvitationToken) setForm('accept');
  }, [pendingInvitationToken]);

  if (identity?.status !== 'registered') return null;

  if (organizations.status === 'inactive' || organizations.status === 'loading') {
    return <StatusMessage variant="loading" title="Henter dine organisationer…" />;
  }

  if (organizations.status === 'error') {
    return (
      <StatusMessage
        variant="error"
        title="Kunne ikke hente dine organisationer"
        message={organizations.message}
        actionLabel="Prøv igen"
        onAction={() => void controller.refresh()}
      />
    );
  }

  const joined = (organization: Organization, how: 'created' | 'accepted') => {
    controller.added(organization);
    clearPendingInvitation();
    setForm(null);
    setNotice(
      how === 'created'
        ? `Organisationen ${organization.name} er oprettet, og du er ejer. Opret nu dens mødelokaler under "Administrer organisation".`
        : `Velkommen i ${organization.name}.`,
    );
  };

  const forms = (
    <>
      {form === 'create' ? <CreateOrganizationForm onCreated={(organization) => joined(organization, 'created')} /> : null}
      {form === 'accept' ? (
        <AcceptInvitationForm initialToken={pendingInvitationToken} onAccepted={(organization) => joined(organization, 'accepted')} />
      ) : null}
    </>
  );

  const { active, organizations: all, notice: syncNotice, syncError } = organizations;
  const described = syncNotice ? describeOrganizationNotice(syncNotice, active) : null;

  const syncMessages = (
    <>
      {described ? (
        <StatusMessage
          variant="warning"
          title={described.title}
          message={described.message}
          actionLabel="OK"
          onAction={() => controller.dismissNotice()}
        />
      ) : null}
      {syncError ? (
        <StatusMessage
          variant="warning"
          title="Kunne ikke opdatere dine organisationer"
          message={`${syncError} Du ser de organisationer og roller, appen sidst hentede. Serveren afgør stadig, hvad du må.`}
          actionLabel="Prøv igen"
          onAction={() => void controller.sync('manual')}
        />
      ) : null}
    </>
  );

  if (active === null) {
    // Onboarding: the list is empty. A list the app could not update is not
    // known to be empty, so it shows the sync problem too.
    const access = describeOrganizationAccess(identity.user);
    return (
      <Card title="Kom i gang med en organisation" testID="organization-onboarding">
        {syncMessages}
        <Text style={uiStyles.body}>{access.detail}</Text>
        <View style={styles.choices}>
          <View style={uiStyles.flex}>
            <PrimaryButton label="Opret organisation" onPress={() => setForm('create')} variant={form === 'create' ? 'primary' : 'secondary'} />
          </View>
          <View style={uiStyles.flex}>
            <PrimaryButton label="Har en invitation" onPress={() => setForm('accept')} variant={form === 'accept' ? 'primary' : 'secondary'} />
          </View>
        </View>
        {forms}
      </Card>
    );
  }

  return (
    <Card testID="organization-panel">
      {syncMessages}
      <Text style={styles.label}>Aktiv organisation</Text>
      <View style={uiStyles.between}>
        <Text style={[styles.name, uiStyles.flex]} numberOfLines={2}>
          {active.name}
          {active.isLegacy ? <Text style={uiStyles.caption}> (standardorganisation)</Text> : null}
        </Text>
        <RoleBadge role={active.role} />
      </View>

      {all.length > 1 ? (
        <View style={styles.switcher}>
          <Text style={uiStyles.caption}>Skift organisation</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {all.map((organization) => (
              <Chip
                key={organization.publicId}
                label={organization.name}
                selected={organization.publicId === active.publicId}
                onPress={() => {
                  setNotice(null);
                  controller.select(organization.publicId);
                }}
                accessibilityLabel={`Skift til ${organization.name}`}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}

      {notice ? (
        <Text style={uiStyles.success} accessibilityLiveRegion="polite">
          {notice}
        </Text>
      ) : null}

      {canAdminister(active.role) ? (
        <PrimaryButton label="Administrer organisation" onPress={onOpenAdmin} variant="secondary" />
      ) : null}

      <View style={styles.links}>
        <LinkButton label={form === 'create' ? 'Luk' : 'Ny organisation'} onPress={() => setForm(form === 'create' ? null : 'create')} />
        <LinkButton
          label={form === 'accept' ? 'Luk' : 'Accepter invitation'}
          onPress={() => {
            if (form === 'accept') clearPendingInvitation();
            setForm(form === 'accept' ? null : 'accept');
          }}
        />
      </View>
      {forms}
    </Card>
  );
}

const styles = StyleSheet.create({
  label: { ...typography.label, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  name: { ...typography.heading, color: colors.text },
  switcher: { gap: spacing.xs },
  chips: { gap: spacing.sm, paddingVertical: 2 },
  choices: { flexDirection: 'row', gap: spacing.md },
  links: { flexDirection: 'row', gap: spacing.xl },
});

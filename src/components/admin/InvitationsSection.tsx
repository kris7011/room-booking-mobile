import { useCallback, useEffect, useState } from 'react';
import { Share, Text, View } from 'react-native';

import { describeRole } from '../../api/current-user';
import { liveOrganizationsApi } from '../../api/organizations-api';
import type { LoadState } from '../../models/load-state';
import type { CreatedInvitation, Invitation, MembershipRole, Organization } from '../../models/organization';
import { invitationLink } from '../../organizations/invitation-link';
import { describeOrganizationError } from '../../organizations/organization-messages';
import { invitableRoles } from '../../organizations/permissions';
import { formatTime, shortDateLabel } from '../../utils/date-time';
import { Chip } from '../Chip';
import { StatusMessage } from '../StatusMessage';
import { Card, ConfirmAction, PrimaryButton, TextField, uiStyles } from '../ui';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+$/;

/**
 * Invite by e-mail, share the invitation, and see and revoke open ones.
 * The code is shown once, right after inviting: the API keeps only its
 * hash. It is never logged.
 */
export function InvitationsSection({ organization }: { organization: Organization }) {
  const roles = invitableRoles(organization.role);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<MembershipRole>('Member');
  const [sending, setSending] = useState(false);
  const [showValidation, setShowValidation] = useState(false);
  const [created, setCreated] = useState<CreatedInvitation | null>(null);
  const [invitations, setInvitations] = useState<LoadState<Invitation[]>>({ status: 'idle' });
  const [busyId, setBusyId] = useState<number | null>(null);
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  const emailError = EMAIL_PATTERN.test(email.trim()) ? null : 'Skriv en gyldig e-mailadresse.';

  const load = useCallback(async () => {
    setInvitations((previous) => (previous.status === 'success' ? previous : { status: 'loading' }));
    try {
      setInvitations({ status: 'success', data: await liveOrganizationsApi.listInvitations(organization.publicId) });
    } catch (caught) {
      setInvitations({ status: 'error', message: describeOrganizationError(caught) });
    }
  }, [organization.publicId]);

  useEffect(() => {
    void load();
  }, [load]);

  const invite = async () => {
    setShowValidation(true);
    if (emailError || sending) return;
    setSending(true);
    setMessage(null);
    setCreated(null);
    try {
      const invitation = await liveOrganizationsApi.invite(organization.publicId, email.trim(), role);
      setCreated(invitation);
      setEmail('');
      setShowValidation(false);
      await load();
    } catch (caught) {
      setMessage({ kind: 'error', text: describeOrganizationError(caught) });
    } finally {
      setSending(false);
    }
  };

  const share = (invitation: CreatedInvitation) => {
    const link = invitationLink(invitation.token);
    void Share.share({
      title: `Invitation til ${invitation.organizationName}`,
      message:
        `Du er inviteret til ${invitation.organizationName} i Room Booking som ${describeRole(invitation.role).toLowerCase()}.\n\n` +
        `Åbn linket på din telefon: ${link}\n\nEller indsæt koden i appen under "Accepter invitation": ${invitation.token}\n\n` +
        `Log ind med Microsoft-kontoen for ${invitation.email}.`,
    }).catch(() => undefined);
  };

  const revoke = async (invitation: Invitation) => {
    setBusyId(invitation.id);
    setMessage(null);
    try {
      await liveOrganizationsApi.revokeInvitation(organization.publicId, invitation.id);
      setMessage({ kind: 'success', text: `Invitationen til ${invitation.email} er trukket tilbage.` });
      await load();
    } catch (caught) {
      setMessage({ kind: 'error', text: describeOrganizationError(caught) });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card
      title="Invitationer"
      subtitle={roles.includes('Admin') ? 'Inviter medlemmer og administratorer.' : 'Som administrator kan du invitere medlemmer.'}
      testID="admin-invitations"
    >
      <TextField
        label="E-mailadresse"
        value={email}
        onChangeText={setEmail}
        placeholder="navn@firma.dk"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        error={showValidation ? emailError : null}
      />
      {roles.length > 1 ? (
        <View style={uiStyles.row}>
          {roles.map((candidate) => (
            <Chip key={candidate} label={describeRole(candidate)} selected={role === candidate} onPress={() => setRole(candidate)} />
          ))}
        </View>
      ) : null}
      <PrimaryButton label="Send invitation" onPress={() => void invite()} loading={sending} />

      {created ? (
        <View style={uiStyles.stack} testID="created-invitation">
          <StatusMessage
            variant="success"
            title={`Invitation til ${created.email} oprettet`}
            message={`Del invitationen nu – koden vises kun denne ene gang. Den gælder til ${shortDateLabel(new Date(created.expiresUtc))} kl. ${formatTime(new Date(created.expiresUtc))}.`}
          />
          <Text style={uiStyles.caption}>Invitationskode</Text>
          <Text style={uiStyles.body} selectable>
            {created.token}
          </Text>
          <PrimaryButton label="Del invitation" onPress={() => share(created)} />
        </View>
      ) : null}

      {message ? (
        <Text style={message.kind === 'error' ? uiStyles.error : uiStyles.success} accessibilityLiveRegion="polite">
          {message.text}
        </Text>
      ) : null}

      <Text style={uiStyles.strong}>Aktive invitationer</Text>
      {invitations.status === 'idle' || invitations.status === 'loading' ? (
        <StatusMessage variant="loading" title="Henter invitationer…" />
      ) : invitations.status === 'error' ? (
        <StatusMessage variant="error" title="Kunne ikke hente invitationer" message={invitations.message} actionLabel="Prøv igen" onAction={() => void load()} />
      ) : invitations.data.length === 0 ? (
        <Text style={uiStyles.caption}>Ingen åbne invitationer.</Text>
      ) : (
        invitations.data.map((invitation) => (
          <View key={invitation.id} style={uiStyles.listItem}>
            <Text style={uiStyles.strong} numberOfLines={1}>
              {invitation.email}
            </Text>
            <Text style={uiStyles.caption}>
              {describeRole(invitation.role)} · inviteret af {invitation.invitedBy}
              {invitation.isExpired ? ' · udløbet' : ''}
            </Text>
            {invitation.canRevoke ? (
              <ConfirmAction
                label="Træk tilbage"
                confirmLabel="Bekræft: træk tilbage"
                busy={busyId === invitation.id}
                onConfirm={() => void revoke(invitation)}
              />
            ) : null}
          </View>
        ))
      )}
    </Card>
  );
}

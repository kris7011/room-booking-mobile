import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { describeRole } from '../../api/current-user';
import { liveOrganizationsApi } from '../../api/organizations-api';
import type { LoadState } from '../../models/load-state';
import type { Member, MembershipRole, Organization } from '../../models/organization';
import { describeOrganizationError } from '../../organizations/organization-messages';
import { canChangeRoles, canRemoveMember } from '../../organizations/permissions';
import { Chip } from '../Chip';
import { StatusMessage } from '../StatusMessage';
import { Card, ConfirmAction, RoleBadge, uiStyles } from '../ui';

const ROLES: MembershipRole[] = ['Owner', 'Admin', 'Member'];

/**
 * The member list. Owners change roles and remove members; anyone can
 * leave. The last Owner is protected by the API (409 last_owner).
 */
export function MembersSection({
  organization,
  onChanged,
  onOwnRoleChanged,
  onLeft,
}: {
  organization: Organization;
  onChanged: () => void;
  /** The user changed their own role (e.g. handed over ownership). */
  onOwnRoleChanged: () => void;
  onLeft: () => void;
}) {
  const [members, setMembers] = useState<LoadState<Member[]>>({ status: 'idle' });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const ownerView = canChangeRoles(organization.role);

  const load = useCallback(async () => {
    setMembers((previous) => (previous.status === 'success' ? previous : { status: 'loading' }));
    try {
      setMembers({ status: 'success', data: await liveOrganizationsApi.listMembers(organization.publicId) });
    } catch (caught) {
      setMembers({ status: 'error', message: describeOrganizationError(caught) });
    }
  }, [organization.publicId]);

  useEffect(() => {
    void load();
  }, [load]);

  const changeRole = async (member: Member, role: MembershipRole) => {
    if (role === member.role) return;
    setBusyId(member.userPublicId);
    setMessage(null);
    try {
      await liveOrganizationsApi.changeRole(organization.publicId, member.userPublicId, role);
      setMessage({ kind: 'success', text: `${member.displayName} er nu ${describeRole(role).toLowerCase()}.` });
      onChanged();
      if (member.isCurrentUser) onOwnRoleChanged();
      else await load();
    } catch (caught) {
      setMessage({ kind: 'error', text: describeOrganizationError(caught) });
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (member: Member) => {
    setBusyId(member.userPublicId);
    setMessage(null);
    try {
      await liveOrganizationsApi.removeMember(organization.publicId, member.userPublicId);
      if (member.isCurrentUser) {
        onLeft();
        return;
      }
      setMessage({ kind: 'success', text: `${member.displayName} er fjernet fra organisationen. Bookingerne er bevaret.` });
      onChanged();
      await load();
    } catch (caught) {
      setMessage({ kind: 'error', text: describeOrganizationError(caught) });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card
      title="Medlemmer"
      subtitle={ownerView ? 'Kun ejere kan ændre roller og fjerne medlemmer.' : 'Kun ejere kan ændre roller.'}
      testID="admin-members"
    >
      {message ? (
        <Text style={message.kind === 'error' ? uiStyles.error : uiStyles.success} accessibilityLiveRegion="polite">
          {message.text}
        </Text>
      ) : null}

      {members.status === 'idle' || members.status === 'loading' ? (
        <StatusMessage variant="loading" title="Henter medlemmer…" />
      ) : members.status === 'error' ? (
        <StatusMessage variant="error" title="Kunne ikke hente medlemmer" message={members.message} actionLabel="Prøv igen" onAction={() => void load()} />
      ) : (
        members.data.map((member) => (
          <View key={member.userPublicId} style={uiStyles.listItem}>
            <View style={uiStyles.between}>
              <Text style={[uiStyles.strong, uiStyles.flex]} numberOfLines={1}>
                {member.displayName}
                {member.isCurrentUser ? <Text style={uiStyles.caption}> (dig)</Text> : null}
              </Text>
              <RoleBadge role={member.role} />
            </View>

            {ownerView ? (
              <View style={uiStyles.row}>
                {ROLES.map((role) => (
                  <Chip
                    key={role}
                    label={describeRole(role)}
                    selected={member.role === role}
                    onPress={() => void changeRole(member, role)}
                    accessibilityLabel={`Gør ${member.displayName} til ${describeRole(role).toLowerCase()}`}
                  />
                ))}
              </View>
            ) : null}

            {canRemoveMember(organization.role, member.isCurrentUser) ? (
              <ConfirmAction
                label={member.isCurrentUser ? 'Forlad organisationen' : 'Fjern fra organisationen'}
                confirmLabel={member.isCurrentUser ? 'Bekræft: forlad' : 'Bekræft fjernelse'}
                busy={busyId === member.userPublicId}
                onConfirm={() => void remove(member)}
              />
            ) : null}
          </View>
        ))
      )}
    </Card>
  );
}

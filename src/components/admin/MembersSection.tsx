import { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { describeRole } from '../../api/current-user';
import { liveOrganizationsApi } from '../../api/organizations-api';
import type { LoadState } from '../../models/load-state';
import type { Member, MembershipRole, Organization } from '../../models/organization';
import { describeOrganizationError, describeSoleOwner } from '../../organizations/organization-messages';
import { canChangeRoles, isSoleOwner, memberActions } from '../../organizations/permissions';
import { Chip } from '../Chip';
import { StatusMessage } from '../StatusMessage';
import { Card, ConfirmAction, RoleBadge, uiStyles } from '../ui';

const ROLES: MembershipRole[] = ['Owner', 'Admin', 'Member'];

/**
 * The member list. Owners change roles and remove members; anyone can
 * leave. The only Owner is offered neither a new role nor leaving, but told
 * to hand over ownership first; the API refuses both anyway (409 last_owner).
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

  // A response for an organisation the user has since switched away from is
  // dropped, so one organisation's members are never shown under another.
  const shownOrganization = useRef(organization.publicId);
  shownOrganization.current = organization.publicId;

  const load = useCallback(async () => {
    const organizationId = organization.publicId;
    setMembers((previous) => (previous.status === 'success' ? previous : { status: 'loading' }));
    try {
      const data = await liveOrganizationsApi.listMembers(organizationId);
      if (shownOrganization.current === organizationId) setMembers({ status: 'success', data });
    } catch (caught) {
      if (shownOrganization.current === organizationId) setMembers({ status: 'error', message: describeOrganizationError(caught) });
    }
  }, [organization.publicId]);

  useEffect(() => {
    setMembers({ status: 'loading' });
    setMessage(null);
    void load();
  }, [load]);

  // A refused change usually means the list is out of date (e.g. changed on
  // another device): show the error and what the API says now.
  const refused = async (caught: unknown) => {
    setMessage({ kind: 'error', text: describeOrganizationError(caught) });
    await load();
  };

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
      await refused(caught);
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
      await refused(caught);
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
        members.data.map((member) => {
          const actions = memberActions(organization.role, member, members);
          return (
            <View key={member.userPublicId} style={uiStyles.listItem}>
              <View style={uiStyles.between}>
                <Text style={[uiStyles.strong, uiStyles.flex]} numberOfLines={1}>
                  {member.displayName}
                  {member.isCurrentUser ? <Text style={uiStyles.caption}> (dig)</Text> : null}
                </Text>
                <RoleBadge role={member.role} />
              </View>

              {member.isCurrentUser && isSoleOwner(members) ? (
                <Text style={uiStyles.caption} accessibilityRole="text" testID="sole-owner-notice">
                  {describeSoleOwner(members.data.length)}
                </Text>
              ) : null}

              {actions.canChangeRole ? (
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

              {actions.canRemove ? (
                <ConfirmAction
                  label={member.isCurrentUser ? 'Forlad organisationen' : 'Fjern fra organisationen'}
                  confirmLabel={member.isCurrentUser ? 'Bekræft: forlad' : 'Bekræft fjernelse'}
                  busy={busyId === member.userPublicId}
                  onConfirm={() => void remove(member)}
                />
              ) : null}
            </View>
          );
        })
      )}
    </Card>
  );
}

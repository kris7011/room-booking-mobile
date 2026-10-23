import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { liveOrganizationsApi } from '../../api/organizations-api';
import type { LoadState } from '../../models/load-state';
import type { Organization, OrganizationDetails } from '../../models/organization';
import { describeOrganizationError } from '../../organizations/organization-messages';
import { canRename } from '../../organizations/permissions';
import { StatusMessage } from '../StatusMessage';
import { Card, LinkButton, PrimaryButton, RoleBadge, TextField, uiStyles } from '../ui';

/** Name, the user's role and counts; Owners rename (never the legacy organisation). */
export function OrganizationInfoSection({
  organization,
  version,
  onRenamed,
}: {
  organization: Organization;
  /** Changes when rooms or members change, so the counts reload. */
  version: number;
  onRenamed: (organization: Organization) => void;
}) {
  const [details, setDetails] = useState<LoadState<OrganizationDetails>>({ status: 'idle' });
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(organization.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setDetails((previous) => (previous.status === 'success' ? previous : { status: 'loading' }));
    try {
      setDetails({ status: 'success', data: await liveOrganizationsApi.get(organization.publicId) });
    } catch (caught) {
      setDetails({ status: 'error', message: describeOrganizationError(caught) });
    }
  }, [organization.publicId]);

  useEffect(() => {
    void load();
  }, [load, version]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const renamed = await liveOrganizationsApi.rename(organization.publicId, name);
      setEditing(false);
      onRenamed({ ...organization, name: renamed.name });
      void load();
    } catch (caught) {
      setError(describeOrganizationError(caught));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card title="Oplysninger" testID="admin-info">
      <View style={uiStyles.between}>
        <Text style={[uiStyles.strong, uiStyles.flex]}>{organization.name}</Text>
        <RoleBadge role={organization.role} />
      </View>
      {organization.isLegacy ? (
        <Text style={uiStyles.caption}>Standardorganisationen med alle lokaler og bookinger fra før organisationer fandtes.</Text>
      ) : null}
      {details.status === 'success' ? (
        <Text style={uiStyles.caption}>
          {details.data.memberCount} {details.data.memberCount === 1 ? 'medlem' : 'medlemmer'} ·{' '}
          {details.data.activeRoomCount} {details.data.activeRoomCount === 1 ? 'aktivt mødelokale' : 'aktive mødelokaler'}
        </Text>
      ) : details.status === 'error' ? (
        <StatusMessage variant="error" title="Kunne ikke hente oplysninger" message={details.message} actionLabel="Prøv igen" onAction={() => void load()} />
      ) : (
        <Text style={uiStyles.caption}>Henter oplysninger…</Text>
      )}

      {canRename(organization.role, organization.isLegacy) ? (
        editing ? (
          <View style={uiStyles.stack}>
            <TextField label="Nyt navn" value={name} onChangeText={setName} maxLength={120} autoCapitalize="words" />
            {error ? <Text style={uiStyles.error}>{error}</Text> : null}
            <View style={uiStyles.row}>
              <View style={uiStyles.flex}>
                <PrimaryButton label="Annuller" variant="secondary" onPress={() => setEditing(false)} disabled={saving} />
              </View>
              <View style={uiStyles.flex}>
                <PrimaryButton label="Gem navn" onPress={() => void save()} loading={saving} />
              </View>
            </View>
          </View>
        ) : (
          <LinkButton
            label="Omdøb organisation"
            onPress={() => {
              setName(organization.name);
              setEditing(true);
            }}
          />
        )
      ) : null}
    </Card>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { liveOrganizationsApi } from '../../api/organizations-api';
import type { LoadState } from '../../models/load-state';
import type { Organization, OrganizationRoom } from '../../models/organization';
import { describeOrganizationError } from '../../organizations/organization-messages';
import { readRoomDraft, type RoomDraft } from '../../organizations/room-form';
import { capacityLabel } from '../../utils/room-fit';
import { StatusMessage } from '../StatusMessage';
import { Card, ConfirmAction, LinkButton, PrimaryButton, TextField, uiStyles } from '../ui';

/** Owners and Admins create, edit, archive and restore rooms. */
export function RoomsSection({ organization, onChanged }: { organization: Organization; onChanged: () => void }) {
  const [rooms, setRooms] = useState<LoadState<OrganizationRoom[]>>({ status: 'idle' });
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  const load = useCallback(async () => {
    setRooms((previous) => (previous.status === 'success' ? previous : { status: 'loading' }));
    try {
      setRooms({ status: 'success', data: await liveOrganizationsApi.listRooms(organization.publicId, { includeArchived: true }) });
    } catch (caught) {
      setRooms({ status: 'error', message: describeOrganizationError(caught) });
    }
  }, [organization.publicId]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (roomId: number | null, action: () => Promise<unknown>, success: string) => {
    setBusyId(roomId);
    setMessage(null);
    try {
      await action();
      setMessage({ kind: 'success', text: success });
      onChanged();
      await load();
      return true;
    } catch (caught) {
      setMessage({ kind: 'error', text: describeOrganizationError(caught) });
      return false;
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card title="Mødelokaler" subtitle="Medlemmer kan søge og booke de aktive lokaler." testID="admin-rooms">
      {message ? (
        <Text style={message.kind === 'error' ? uiStyles.error : uiStyles.success} accessibilityLiveRegion="polite">
          {message.text}
        </Text>
      ) : null}

      {creating ? (
        <RoomForm
          submitLabel="Opret lokale"
          onCancel={() => setCreating(false)}
          onSubmit={async (room) => {
            const ok = await run(null, () => liveOrganizationsApi.createRoom(organization.publicId, room), `${room.name} er oprettet.`);
            if (ok) setCreating(false);
          }}
        />
      ) : (
        <PrimaryButton label="Opret mødelokale" onPress={() => setCreating(true)} variant="secondary" />
      )}

      {rooms.status === 'idle' || rooms.status === 'loading' ? (
        <StatusMessage variant="loading" title="Henter mødelokaler…" />
      ) : rooms.status === 'error' ? (
        <StatusMessage variant="error" title="Kunne ikke hente mødelokaler" message={rooms.message} actionLabel="Prøv igen" onAction={() => void load()} />
      ) : rooms.data.length === 0 ? (
        <StatusMessage variant="empty" title="Ingen mødelokaler endnu" message="Opret det første lokale, så medlemmerne kan booke det." />
      ) : (
        rooms.data.map((room) =>
          editingId === room.id ? (
            <View key={room.id} style={uiStyles.listItem}>
              <RoomForm
                initial={{ name: room.name, capacity: String(room.capacity) }}
                submitLabel="Gem ændringer"
                onCancel={() => setEditingId(null)}
                onSubmit={async (changed) => {
                  const ok = await run(room.id, () => liveOrganizationsApi.updateRoom(organization.publicId, room.id, changed), `${changed.name} er gemt.`);
                  if (ok) setEditingId(null);
                }}
              />
            </View>
          ) : (
            <View key={room.id} style={uiStyles.listItem}>
              <View style={uiStyles.between}>
                <Text style={[uiStyles.strong, uiStyles.flex]} numberOfLines={1}>
                  {room.name}
                </Text>
                {room.archivedUtc ? <Text style={uiStyles.caption}>Arkiveret</Text> : null}
              </View>
              <Text style={uiStyles.caption}>{capacityLabel(room.capacity)}</Text>
              <View style={uiStyles.row}>
                {room.archivedUtc ? (
                  <LinkButton
                    label="Gendan"
                    disabled={busyId !== null}
                    onPress={() =>
                      void run(room.id, () => liveOrganizationsApi.restoreRoom(organization.publicId, room.id), `${room.name} er gendannet.`)
                    }
                  />
                ) : (
                  <>
                    <LinkButton label="Rediger" disabled={busyId !== null} onPress={() => setEditingId(room.id)} />
                    <ConfirmAction
                      label="Arkivér"
                      confirmLabel="Bekræft arkivering"
                      busy={busyId === room.id}
                      onConfirm={() =>
                        void run(
                          room.id,
                          () => liveOrganizationsApi.archiveRoom(organization.publicId, room.id),
                          `${room.name} er arkiveret. Tidligere bookinger er bevaret.`,
                        )
                      }
                    />
                  </>
                )}
              </View>
            </View>
          ),
        )
      )}
    </Card>
  );
}

function RoomForm({
  initial = { name: '', capacity: '' },
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: RoomDraft;
  submitLabel: string;
  onSubmit: (room: { name: string; capacity: number }) => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<RoomDraft>(initial);
  const [showValidation, setShowValidation] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const result = readRoomDraft(draft);
  const errors: { nameError?: string; capacityError?: string } = result.ok ? {} : result;

  const submit = async () => {
    setShowValidation(true);
    if (!result.ok || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(result.room);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={uiStyles.stack}>
      <TextField
        label="Lokalets navn"
        value={draft.name}
        onChangeText={(name) => setDraft({ ...draft, name })}
        placeholder="F.eks. Mødelokale 1"
        maxLength={120}
        error={showValidation ? errors.nameError : null}
      />
      <TextField
        label="Antal pladser"
        value={draft.capacity}
        onChangeText={(capacity) => setDraft({ ...draft, capacity })}
        placeholder="F.eks. 6"
        keyboardType="number-pad"
        maxLength={3}
        error={showValidation ? errors.capacityError : null}
      />
      <View style={uiStyles.row}>
        <View style={uiStyles.flex}>
          <PrimaryButton label="Annuller" variant="secondary" onPress={onCancel} disabled={submitting} />
        </View>
        <View style={uiStyles.flex}>
          <PrimaryButton label={submitLabel} onPress={() => void submit()} loading={submitting} />
        </View>
      </View>
    </View>
  );
}

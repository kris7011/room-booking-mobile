import { useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { liveOrganizationsApi } from '../../api/organizations-api';
import type { Organization } from '../../models/organization';
import { describeOrganizationError } from '../../organizations/organization-messages';
import { newRandomId } from '../../utils/random-id';
import { PrimaryButton, TextField, uiStyles } from '../ui';

const MIN_NAME = 2;
const MAX_NAME = 100;

/**
 * Name and "Opret organisation". One Idempotency-Key per name: pressing
 * again after a timeout repeats the same request, so the API never creates
 * the organisation twice; a new name gets a new key.
 */
export function CreateOrganizationForm({ onCreated }: { onCreated: (organization: Organization) => void }) {
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showValidation, setShowValidation] = useState(false);
  const request = useRef<{ name: string; key: string } | null>(null);

  const trimmed = name.trim().replace(/\s+/g, ' ');
  const validation =
    trimmed.length < MIN_NAME
      ? `Navnet skal have mindst ${MIN_NAME} tegn.`
      : trimmed.length > MAX_NAME
        ? `Navnet må højst have ${MAX_NAME} tegn.`
        : null;

  const submit = async () => {
    setShowValidation(true);
    if (validation || submitting) return;

    if (request.current?.name !== trimmed) request.current = { name: trimmed, key: newRandomId() };
    const { key } = request.current;

    setSubmitting(true);
    setError(null);
    try {
      const organization = await liveOrganizationsApi.create(trimmed, key);
      request.current = null;
      setName('');
      setShowValidation(false);
      onCreated(organization);
    } catch (caught) {
      setError(describeOrganizationError(caught));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={uiStyles.stack}>
      <TextField
        label="Organisationens navn"
        value={name}
        onChangeText={setName}
        placeholder="F.eks. Acme ApS"
        maxLength={MAX_NAME + 20}
        autoCapitalize="words"
        returnKeyType="done"
        onSubmitEditing={() => void submit()}
        error={showValidation ? validation : null}
      />
      {error ? (
        <Text style={uiStyles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <PrimaryButton label="Opret organisation" onPress={() => void submit()} loading={submitting} />
    </View>
  );
}

import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { liveOrganizationsApi } from '../../api/organizations-api';
import type { Organization } from '../../models/organization';
import { parseInvitationInput } from '../../organizations/invitation-link';
import { describeOrganizationError } from '../../organizations/organization-messages';
import { PrimaryButton, TextField, uiStyles } from '../ui';

/**
 * Paste the invitation code or link, or arrive from an invitation link.
 * The API also requires the signed-in account's verified e-mail to match
 * the invited address, so the code alone is not enough.
 */
export function AcceptInvitationForm({
  initialToken,
  onAccepted,
}: {
  initialToken?: string | null;
  onAccepted: (organization: Organization) => void;
}) {
  const [input, setInput] = useState(initialToken ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialToken) setInput(initialToken);
  }, [initialToken]);

  const submit = async () => {
    if (submitting) return;
    const token = parseInvitationInput(input);
    if (!token) {
      setError('Indsæt hele invitationskoden eller linket fra invitationen.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const accepted = await liveOrganizationsApi.acceptInvitation(token);
      setInput('');
      onAccepted({ publicId: accepted.publicId, name: accepted.name, isLegacy: accepted.isLegacy, role: accepted.role });
    } catch (caught) {
      setError(describeOrganizationError(caught));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={uiStyles.stack}>
      <TextField
        label="Invitationskode eller link"
        value={input}
        onChangeText={setInput}
        placeholder="Indsæt koden fra invitationen"
        autoCapitalize="none"
        autoCorrect={false}
        // The code is a secret: keep it out of the keyboard's suggestions.
        autoComplete="off"
        importantForAutofill="no"
        returnKeyType="done"
        onSubmitEditing={() => void submit()}
      />
      {error ? (
        <Text style={uiStyles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
      <PrimaryButton label="Accepter invitation" onPress={() => void submit()} loading={submitting} />
    </View>
  );
}

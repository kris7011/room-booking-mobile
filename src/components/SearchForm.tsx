import { StyleSheet, Text, View } from 'react-native';

import type { SearchCriteria } from '../models/search-criteria';
import { colors, radius, spacing, typography } from '../theme/theme';
import { DaySelector } from './DaySelector';
import { FormSection } from './FormSection';
import { ParticipantPicker } from './ParticipantPicker';
import { PrimaryButton } from './PrimaryButton';
import { TimeRangePicker } from './TimeRangePicker';

interface SearchFormProps {
  criteria: SearchCriteria;
  today: Date;
  onChange: (changes: Partial<SearchCriteria>) => void;
  onSearch: () => void;
  searching: boolean;
  validationMessage: string | null;
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} t` : `${hours} t ${rest} min`;
}

export function SearchForm({ criteria, today, onChange, onSearch, searching, validationMessage }: SearchFormProps) {
  return (
    <View style={styles.card}>
      <FormSection title="Antal deltagere">
        <ParticipantPicker value={criteria.participants} onChange={(participants) => onChange({ participants })} />
      </FormSection>

      <FormSection title="Dato">
        <DaySelector value={criteria.day} today={today} onChange={(day) => onChange({ day })} />
      </FormSection>

      <FormSection title="Tidspunkt" hint={`Varighed ${formatDuration(criteria.endMinutes - criteria.startMinutes)}`}>
        <TimeRangePicker
          startMinutes={criteria.startMinutes}
          endMinutes={criteria.endMinutes}
          onChange={(range) => onChange(range)}
        />
      </FormSection>

      {validationMessage ? <Text style={styles.validation}>{validationMessage}</Text> : null}

      <PrimaryButton
        label="Søg efter ledige lokaler"
        onPress={onSearch}
        loading={searching}
        disabled={validationMessage !== null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xl,
    // boxShadow works on iOS, Android (New Architecture) and web alike.
    boxShadow: '0 4px 12px rgba(15, 23, 42, 0.06)',
  },
  validation: { ...typography.body, color: colors.danger, textAlign: 'center' },
});

import { StyleSheet, View } from 'react-native';

import type { SearchCriteria } from '../models/search-criteria';
import { colors, radius, spacing } from '../theme/theme';
import type { StartedWindow } from '../utils/search-window';
import { DaySelector } from './DaySelector';
import { FormSection } from './FormSection';
import { ParticipantPicker } from './ParticipantPicker';
import { PrimaryButton } from './PrimaryButton';
import { StatusMessage } from './StatusMessage';
import { TimeRangePicker } from './TimeRangePicker';

interface SearchFormProps {
  criteria: SearchCriteria;
  today: Date;
  onChange: (changes: Partial<SearchCriteria>) => void;
  onSearch: () => void;
  searching: boolean;
  /** Set when the chosen time has started; searching is blocked until it changes. */
  started: StartedWindow | null;
  onUseSuggestion: () => void;
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} t` : `${hours} t ${rest} min`;
}

export function SearchForm({ criteria, today, onChange, onSearch, searching, started, onUseSuggestion }: SearchFormProps) {
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

      {started ? (
        <StatusMessage
          variant="warning"
          title="Tidspunktet er passeret"
          message={`${started.message} Vælg et senere tidspunkt, eller brug det næste mulige.`}
          actionLabel={`Brug næste tidspunkt: ${started.suggestionLabel}`}
          onAction={onUseSuggestion}
        />
      ) : null}

      <PrimaryButton
        label="Søg efter ledige lokaler"
        onPress={onSearch}
        loading={searching}
        disabled={started !== null}
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
});

import { StyleSheet, Text, View } from 'react-native';

import { apiBaseUrl, isDemoMode } from '../config/env';
import { colors, radius, spacing, typography } from '../theme/theme';

// Always tells the user where data comes from, so demo data is never
// mistaken for real bookings.
export function ApiModeBanner() {
  if (isDemoMode) {
    return (
      <View style={[styles.banner, styles.demo]} accessibilityRole="alert">
        <Text style={[styles.title, styles.demoText]}>DEMODATA</Text>
        <Text style={styles.text}>
          EXPO_PUBLIC_API_URL er ikke sat. Lokaler og bookinger er opdigtede og gemmes ikke.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.banner, styles.live]}>
      <Text style={styles.text} numberOfLines={1}>
        API: {apiBaseUrl}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: { borderRadius: radius.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, gap: 2 },
  demo: { backgroundColor: colors.warningSoft, borderWidth: 1, borderColor: colors.warning },
  live: { backgroundColor: colors.surfaceMuted },
  title: { ...typography.label, letterSpacing: 1 },
  demoText: { color: colors.warning },
  text: { ...typography.caption, color: colors.text },
});

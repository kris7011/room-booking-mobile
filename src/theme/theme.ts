// Shared design tokens. Keeping colors and spacing in one place makes the
// components consistent and lets us restyle the app without hunting for hex codes.
export const colors = {
  background: '#F4F6FA',
  surface: '#FFFFFF',
  surfaceMuted: '#EEF1F6',
  border: '#DCE1EA',
  text: '#16202E',
  textMuted: '#5B6678',
  primary: '#2563EB',
  primaryPressed: '#1D4ED8',
  primarySoft: '#E3ECFE',
  onPrimary: '#FFFFFF',
  success: '#15803D',
  successSoft: '#E5F6EA',
  danger: '#B42318',
  dangerSoft: '#FDECEA',
  warning: '#8A5A00',
  warningSoft: '#FFF4D6',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const typography = {
  title: { fontSize: 28, fontWeight: '700' },
  heading: { fontSize: 18, fontWeight: '700' },
  body: { fontSize: 15, fontWeight: '400' },
  label: { fontSize: 13, fontWeight: '600' },
  caption: { fontSize: 12, fontWeight: '400' },
} as const;

// ESLint flat config, as in https://docs.expo.dev/guides/using-eslint/
// (eslint-config-expo matches the Expo SDK; install both with `npx expo install`).
// `npm run lint` runs it; CI fails on any error or warning.
const { defineConfig, globalIgnores } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  // Generated or build output, never edited by hand. Tests and e2e specs are
  // linted like the app.
  globalIgnores([
    'android/',
    'ios/',
    '.expo/',
    'dist/',
    'web-build/',
    '.test-build/',
    'e2e/.output/',
    'expo-env.d.ts',
  ]),
  {
    rules: {
      // The default also forbids ' and " in JSX text, which only matters for
      // HTML typos; Danish UI text uses apostrophes ("API'et").
      'react/no-unescaped-entities': ['error', { forbid: ['>', '}'] }],
    },
  },
  {
    // Playwright fixtures receive a `use` callback; it is not a React hook.
    files: ['e2e/**'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
    },
  },
  {
    // Baseline: these components start loading in an effect by setting a
    // loading state synchronously, which this rule (added with the React
    // Compiler rules) reports. Changing them is a separate refactor; every
    // other file, and every new one, is checked.
    files: [
      'src/components/BookingArea.tsx',
      'src/components/UpcomingBookings.tsx',
      'src/components/admin/InvitationsSection.tsx',
      'src/components/admin/MembersSection.tsx',
      'src/components/admin/OrganizationInfoSection.tsx',
      'src/components/admin/RoomsSection.tsx',
      'src/components/organizations/AcceptInvitationForm.tsx',
      'src/components/organizations/OrganizationPanel.tsx',
      'src/hooks/useServerIdentity.tsx',
      'src/screens/AppScreens.tsx',
    ],
    rules: {
      'react-hooks/set-state-in-effect': 'off',
    },
  },
]);

import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from './src/auth/AuthProvider';
import { logAuthRedirectUri } from './src/auth/redirect-uri';
import { SessionProvider } from './src/organizations/SessionProvider';
import { AppScreens } from './src/screens/AppScreens';

// Development only: shows in the Metro terminal which redirect URI the
// Microsoft login uses (roombookingdev://auth in the Android development
// build). Nothing on web. Not part of release builds. Never logs tokens.
if (__DEV__) logAuthRedirectUri();

// App only wires up app-wide providers; screens and components live in src/.
export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        {/* The API's view of the signed-in user and their organisations. */}
        <SessionProvider>
          <AppScreens />
        </SessionProvider>
      </AuthProvider>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}

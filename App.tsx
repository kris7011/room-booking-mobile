import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from './src/auth/AuthProvider';
import { logAuthRedirectUri } from './src/auth/redirect-uri';
import { HomeScreen } from './src/screens/HomeScreen';

// Development only: shows in the Metro terminal which redirect URI the
// Microsoft login uses (roombookingdev://auth in the Android development
// build). Nothing on web. Not part of release builds. Never logs tokens.
if (__DEV__) logAuthRedirectUri();

// App only wires up app-wide providers; screens and components live in src/.
export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <HomeScreen />
      </AuthProvider>
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}

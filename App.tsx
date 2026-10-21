import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { logAuthRedirectUri } from './src/auth/redirect-uri';
import { HomeScreen } from './src/screens/HomeScreen';

// Development only: shows in the Metro terminal which redirect URI the coming
// Microsoft login would use (roombookingdev://auth in the Android development
// build). Nothing on web. Not part of release builds.
if (__DEV__) logAuthRedirectUri();

// App only wires up app-wide providers; screens and components live in src/.
export default function App() {
  return (
    <SafeAreaProvider>
      <HomeScreen />
      <StatusBar style="dark" />
    </SafeAreaProvider>
  );
}

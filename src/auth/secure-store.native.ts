// Android and iOS: the session store on top of expo-secure-store. Android
// encrypts the values with a key in the Android Keystore; iOS keeps them in
// the Keychain, readable only while the device is unlocked and never
// migrated to another device through a backup.
import * as SecureStore from 'expo-secure-store';

import type { KeyValueStore } from './session-storage';

const options: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export const secureSessionStore: KeyValueStore = {
  getItem: (key) => SecureStore.getItemAsync(key, options),
  setItem: (key, value) => SecureStore.setItemAsync(key, value, options),
  deleteItem: (key) => SecureStore.deleteItemAsync(key, options),
};

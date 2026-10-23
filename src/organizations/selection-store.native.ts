// Android and iOS: the chosen organisation is remembered in the same
// SecureStore as the session. It is not a secret, but it identifies which
// organisations the user belongs to, so it stays on the device.
import { secureSessionStore } from '../auth/secure-store.native';
import type { KeyValueStore } from '../auth/session-storage';

export const selectionStore: KeyValueStore | null = secureSessionStore;

({ selectionStore }) satisfies typeof import('./selection-store');

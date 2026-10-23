// Web: nothing is signed in, so there is no choice to remember. On Android
// and iOS, Metro uses selection-store.native.ts (SecureStore) instead.
import type { KeyValueStore } from '../auth/session-storage';

export const selectionStore: KeyValueStore | null = null;

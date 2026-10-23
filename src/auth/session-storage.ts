// Persists the session between app starts: the refresh token and who is
// signed in, nothing else. The access token stays in memory and is renewed
// from the refresh token after a restart, so a copy of the device's storage
// never holds a token the API accepts.
//
// The store is SecureStore on a phone (Android Keystore / iOS Keychain,
// excluded from Android Auto Backup by the expo-secure-store config plugin)
// and a Map in the tests. SecureStore does not enforce a size limit, but
// some platforms reject values above about 2 KB, and Entra refresh tokens
// can be longer, so the token is split into chunks.
import { AuthFlowError } from './auth-errors';
import type { AuthUser } from './id-token';

/** The subset of SecureStore the session needs; keys use only [A-Za-z0-9._-]. */
export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  deleteItem(key: string): Promise<void>;
}

export interface StoredSession {
  refreshToken: string;
  user: AuthUser;
}

const PREFIX = 'roombooking.auth.v1';
export const SESSION_META_KEY = `${PREFIX}.meta`;
export const refreshChunkKey = (index: number) => `${PREFIX}.refresh.${index}`;

export const CHUNK_LENGTH = 1800;
/** 8 × 1800 characters; Entra refresh tokens are far shorter. */
export const MAX_CHUNKS = 8;

interface SessionMeta {
  version: 1;
  chunks: number;
  user: AuthUser;
}

/**
 * Writes the chunks first and the metadata last, so an interrupted write
 * leaves either the old session or the new one, never a mix that loads.
 */
export async function saveSession(store: KeyValueStore, session: StoredSession): Promise<void> {
  const chunks: string[] = [];
  for (let start = 0; start < session.refreshToken.length; start += CHUNK_LENGTH) {
    chunks.push(session.refreshToken.slice(start, start + CHUNK_LENGTH));
  }
  if (chunks.length === 0 || chunks.length > MAX_CHUNKS) {
    throw new AuthFlowError('storage', 'Refresh token has an unexpected length');
  }

  const meta: SessionMeta = { version: 1, chunks: chunks.length, user: session.user };
  try {
    const previous = await readMeta(store);
    // Invalidate the old session before overwriting its chunks.
    if (previous) await store.deleteItem(SESSION_META_KEY);
    for (const [index, chunk] of chunks.entries()) await store.setItem(refreshChunkKey(index), chunk);
    await store.setItem(SESSION_META_KEY, JSON.stringify(meta));
    for (let index = chunks.length; index < (previous?.chunks ?? 0); index++) {
      await store.deleteItem(refreshChunkKey(index));
    }
  } catch (error) {
    if (error instanceof AuthFlowError) throw error;
    throw new AuthFlowError('storage', 'Could not write the session');
  }
}

/** The stored session, or null. Anything unreadable is deleted and treated as signed out. */
export async function loadSession(store: KeyValueStore): Promise<StoredSession | null> {
  let meta: SessionMeta | null;
  try {
    meta = await readMeta(store);
  } catch {
    throw new AuthFlowError('storage', 'Could not read the session');
  }
  if (!meta) {
    if ((await store.getItem(SESSION_META_KEY).catch(() => null)) !== null) await clearSession(store);
    return null;
  }

  let refreshToken = '';
  try {
    for (let index = 0; index < meta.chunks; index++) {
      const chunk = await store.getItem(refreshChunkKey(index));
      if (!chunk) {
        await clearSession(store);
        return null;
      }
      refreshToken += chunk;
    }
  } catch {
    throw new AuthFlowError('storage', 'Could not read the session');
  }
  return { refreshToken, user: meta.user };
}

/** Deletes the metadata first, so a half-finished clear never loads as a session. */
export async function clearSession(store: KeyValueStore): Promise<void> {
  const failures: unknown[] = [];
  const remove = async (key: string) => {
    try {
      await store.deleteItem(key);
    } catch (error) {
      failures.push(error);
    }
  };
  await remove(SESSION_META_KEY);
  for (let index = 0; index < MAX_CHUNKS; index++) await remove(refreshChunkKey(index));
  if (failures.length > 0) throw new AuthFlowError('storage', 'Could not delete the session');
}

/** Null when there is no metadata or it is not a valid version 1 record. */
async function readMeta(store: KeyValueStore): Promise<SessionMeta | null> {
  const raw = await store.getItem(SESSION_META_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<SessionMeta>;
    const user = value.user as Partial<AuthUser> | undefined;
    const valid =
      value.version === 1 &&
      Number.isInteger(value.chunks) &&
      (value.chunks ?? 0) >= 1 &&
      (value.chunks ?? 0) <= MAX_CHUNKS &&
      typeof user?.name === 'string' &&
      typeof user.tenantId === 'string' &&
      typeof user.objectId === 'string' &&
      (user.username === null || typeof user.username === 'string');
    return valid ? (value as SessionMeta) : null;
  } catch {
    return null;
  }
}

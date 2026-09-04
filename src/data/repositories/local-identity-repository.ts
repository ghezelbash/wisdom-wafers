import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  AuthError,
  LOCAL_UID_PREFIX,
  type Identity,
  type IdentityRepository,
} from '@/domain/identity/types';

const KEY = 'dananeh.localIdentity.v1';

function makeUid() {
  return `${LOCAL_UID_PREFIX}${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * The degraded identity.
 *
 * Used when Firebase is not configured, or anonymous sign-in fails — an
 * unreachable network, or a project where anonymous auth is switched off. The
 * reader still gets a stable uid and the whole app; what they do not get is
 * sync, and the account offer is what fixes that later.
 *
 * A local uid is deliberately prefixed so it can never be mistaken for one
 * Firebase issued, and so migration can find it.
 */
export class LocalIdentityRepository implements IdentityRepository {
  private identity: Identity | null = null;
  private listeners = new Set<(identity: Identity | null) => void>();

  observe(listener: (identity: Identity | null) => void) {
    this.listeners.add(listener);
    listener(this.identity);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit() {
    for (const listener of this.listeners) listener(this.identity);
  }

  async ensureSignedIn(): Promise<Identity> {
    if (this.identity) return this.identity;

    let uid: string;
    try {
      uid = (await AsyncStorage.getItem(KEY)) ?? makeUid();
      await AsyncStorage.setItem(KEY, uid);
    } catch {
      // Even with storage unavailable the session must start; it just will not
      // survive a restart.
      uid = makeUid();
    }

    this.identity = { uid, source: 'local', email: null, emailVerified: false };
    this.emit();
    return this.identity;
  }

  /**
   * Every credential action fails the same way, and says why.
   *
   * `notConfigured`, not `network`: there is no backend for this build to
   * reach, which is a different problem from a connection that dropped. Saying
   * "we could not connect" sends the reader to check their wifi for something
   * only the person who built the app can fix.
   */
  async linkEmailPassword(): Promise<Identity> {
    throw new AuthError('notConfigured');
  }

  async signIn(): Promise<Identity> {
    throw new AuthError('notConfigured');
  }

  async reauthenticate(): Promise<void> {
    throw new AuthError('notConfigured');
  }

  async signOut(): Promise<void> {
    this.identity = null;
    this.emit();
  }

  async sendVerificationEmail(): Promise<void> {
    throw new AuthError('notConfigured');
  }

  async sendPasswordReset(): Promise<void> {
    throw new AuthError('notConfigured');
  }
}

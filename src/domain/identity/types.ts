/**
 * Identity, as the app understands it.
 *
 * A reader always has one: anonymous from first launch, upgraded in place when
 * they create an account. `local` is the degraded case — no backend reachable —
 * and the app still works, because guest-first means guest-first.
 */
export type IdentitySource = 'anonymous' | 'account' | 'local';

export interface Identity {
  uid: string;
  source: IdentitySource;
  email: string | null;
  emailVerified: boolean;
}

export const isGuest = (identity: Identity | null) =>
  !identity || identity.source !== 'account';

/**
 * A uid this device minted for itself, with no backend behind it.
 *
 * The prefix is the contract: `LocalIdentityRepository` writes it, and identity
 * migration looks for it — a uid that only exists on one device has work that
 * still needs handing over to a real one.
 */
export const LOCAL_UID_PREFIX = 'local-';

export const isLocalUid = (uid: string) => uid.startsWith(LOCAL_UID_PREFIX);

/**
 * Every failure the identity layer can surface, named in the app's own terms.
 *
 * Raw Firebase codes never reach a screen: they leak implementation detail and
 * are not translatable.
 */
export type AuthErrorCode =
  | 'invalidEmail'
  | 'weakPassword'
  | 'emailInUse'
  | 'invalidCredential'
  | 'tooManyRequests'
  | 'network'
  /**
   * There is no backend for this build to talk to at all.
   *
   * Distinct from `network` on purpose. A development build does not reach a
   * real project unless told to, so "we could not connect" is not what
   * happened and sends whoever reads it to check their wifi. The cause is
   * configuration, and only the person running the build can fix it.
   */
  | 'notConfigured'
  | 'notAllowed'
  | 'requiresRecentLogin'
  | 'unknown';

export class AuthError extends Error {
  constructor(
    readonly code: AuthErrorCode,
    readonly cause?: unknown
  ) {
    super(code);
    this.name = 'AuthError';
  }
}

export interface IdentityRepository {
  /** Emits on every identity change; returns an unsubscribe. */
  observe(listener: (identity: Identity | null) => void): () => void;
  /** Guarantees a uid exists, signing in anonymously if needed. */
  ensureSignedIn(): Promise<Identity>;
  /** Upgrades the current anonymous identity in place, keeping its uid. */
  linkEmailPassword(email: string, password: string): Promise<Identity>;
  signIn(email: string, password: string): Promise<Identity>;
  signOut(): Promise<void>;
  sendVerificationEmail(): Promise<void>;
  sendPasswordReset(email: string): Promise<void>;
}

import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  linkWithCredential,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';

import { getFirebaseAuth } from '@/data/remote/firebase-app';
import {
  AuthError,
  type AuthErrorCode,
  type Identity,
  type IdentityRepository,
} from '@/domain/identity/types';

/** Firebase's codes are implementation detail; these are the app's own terms. */
const CODES: Record<string, AuthErrorCode> = {
  'auth/invalid-email': 'invalidEmail',
  'auth/missing-email': 'invalidEmail',
  'auth/weak-password': 'weakPassword',
  'auth/missing-password': 'weakPassword',
  'auth/email-already-in-use': 'emailInUse',
  'auth/credential-already-in-use': 'emailInUse',
  'auth/invalid-credential': 'invalidCredential',
  'auth/wrong-password': 'invalidCredential',
  'auth/user-not-found': 'invalidCredential',
  'auth/too-many-requests': 'tooManyRequests',
  'auth/network-request-failed': 'network',
  'auth/operation-not-allowed': 'notAllowed',
  'auth/admin-restricted-operation': 'notAllowed',
  'auth/requires-recent-login': 'requiresRecentLogin',
};

function toAuthError(error: unknown): AuthError {
  const code = (error as { code?: string })?.code ?? '';
  return new AuthError(CODES[code] ?? 'unknown', error);
}

function toIdentity(user: User): Identity {
  return {
    uid: user.uid,
    source: user.isAnonymous ? 'anonymous' : 'account',
    email: user.email,
    emailVerified: user.emailVerified,
  };
}

/**
 * Identity backed by Firebase Auth.
 *
 * The reader is signed in anonymously from first launch, so every piece of
 * progress has a stable owner before an account exists. Creating an account
 * **links** that credential to the same uid — it never creates a second one,
 * because everything they have done is keyed on the first.
 */
export class FirebaseIdentityRepository implements IdentityRepository {
  observe(listener: (identity: Identity | null) => void) {
    return onAuthStateChanged(getFirebaseAuth(), (user) =>
      listener(user ? toIdentity(user) : null)
    );
  }

  async ensureSignedIn(): Promise<Identity> {
    const auth = getFirebaseAuth();
    // The SDK restores a persisted session asynchronously. Reading
    // `currentUser` before that finishes reports "nobody" for a returning
    // reader, which would mint a second anonymous account on every launch.
    await auth.authStateReady();
    if (auth.currentUser) return toIdentity(auth.currentUser);

    try {
      const credential = await signInAnonymously(auth);
      return toIdentity(credential.user);
    } catch (error) {
      throw toAuthError(error);
    }
  }

  async linkEmailPassword(email: string, password: string): Promise<Identity> {
    const auth = getFirebaseAuth();
    // Same race, worse consequence: mistaking a restoring session for no
    // session sends this down the create path and orphans everything the guest
    // has done.
    await auth.authStateReady();
    const current = auth.currentUser;

    try {
      // The upgrade path: same uid, so saved seeds, progress and reviews come
      // with them. Only a reader with no anonymous session at all gets a fresh
      // account.
      if (current?.isAnonymous) {
        const credential = EmailAuthProvider.credential(email, password);
        const linked = await linkWithCredential(current, credential);
        return toIdentity(linked.user);
      }

      const created = await createUserWithEmailAndPassword(auth, email, password);
      return toIdentity(created.user);
    } catch (error) {
      throw toAuthError(error);
    }
  }

  async signIn(email: string, password: string): Promise<Identity> {
    try {
      await getFirebaseAuth().authStateReady();
      const credential = await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
      return toIdentity(credential.user);
    } catch (error) {
      throw toAuthError(error);
    }
  }

  async signOut(): Promise<void> {
    await firebaseSignOut(getFirebaseAuth());
  }

  async sendVerificationEmail(): Promise<void> {
    const user = getFirebaseAuth().currentUser;
    if (!user) throw new AuthError('unknown');
    try {
      await sendEmailVerification(user);
    } catch (error) {
      throw toAuthError(error);
    }
  }

  async sendPasswordReset(email: string): Promise<void> {
    try {
      await sendPasswordResetEmail(getFirebaseAuth(), email);
    } catch (error) {
      throw toAuthError(error);
    }
  }
}

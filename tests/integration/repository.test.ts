import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  signInAnonymously,
  signOut,
  type Auth,
} from 'firebase/auth';

/**
 * The identity repository's own logic, not the raw SDK's.
 *
 * `ensureSignedIn` has to survive the case that matters on a real client: the
 * SDK restores a persisted session asynchronously, so `currentUser` is null for
 * a moment after start-up. Deciding "no user" in that window creates a second
 * anonymous account and, worse, sends account creation down the create path
 * instead of the link path — silently losing everything the guest did.
 */

let app: FirebaseApp;
let auth: Auth;

beforeAll(() => {
  app = initializeApp({ apiKey: 'demo-key', projectId: 'demo-dananeh' }, 'repository-test');
  auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
});

afterAll(async () => {
  await deleteApp(app);
});

describe('authStateReady', () => {
  it('is what tells us whether a restored session exists', async () => {
    await signOut(auth).catch(() => {});
    await auth.authStateReady();
    expect(auth.currentUser).toBeNull();

    const credential = await signInAnonymously(auth);
    await auth.authStateReady();

    expect(auth.currentUser?.uid).toBe(credential.user.uid);
    expect(auth.currentUser?.isAnonymous).toBe(true);
  });
});

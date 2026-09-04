import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app';
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  getAuth,
  linkWithCredential,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
} from 'firebase/auth';
import {
  connectFirestoreEmulator,
  doc,
  getDoc,
  getFirestore,
  setDoc,
  type Firestore,
} from 'firebase/firestore';

/**
 * The upgrade promise, end to end.
 *
 * The account offer tells the reader «همین داده منتقل می‌شود، از صفر شروع
 * نمی‌کنی». That is only true if creating an account *links* the anonymous
 * credential instead of creating a second uid — so this asserts the uid, and
 * the data hanging off it, survive the upgrade.
 */

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;

const password = 'seed-password-1405';
const email = () => `reader-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

beforeAll(() => {
  app = initializeApp({ apiKey: 'demo-key', projectId: 'demo-dananeh' }, 'identity-test');
  auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  db = getFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8181);
});

afterAll(async () => {
  await deleteApp(app);
});

beforeEach(async () => {
  await signOut(auth).catch(() => {});
});

describe('anonymous first launch', () => {
  it('gives a reader a uid before they have an account', async () => {
    const credential = await signInAnonymously(auth);

    expect(credential.user.uid).toBeTruthy();
    expect(credential.user.isAnonymous).toBe(true);
    expect(credential.user.email).toBeNull();
  });

  it('keeps the same uid across the session', async () => {
    const first = await signInAnonymously(auth);
    const second = await signInAnonymously(auth);
    expect(second.user.uid).toBe(first.user.uid);
  });
});

describe('upgrading a guest to an account', () => {
  it('keeps the uid, so progress written as a guest is still theirs', async () => {
    const guest = await signInAnonymously(auth);
    const guestUid = guest.user.uid;

    // Something worth keeping: a finished seed.
    await setDoc(doc(db, `users/${guestUid}/progress/seed-sky-darkness`), {
      seedId: 'seed-sky-darkness',
      revision: 4,
      percent: 100,
      status: 'completed',
    });

    const address = email();
    const linked = await linkWithCredential(
      guest.user,
      EmailAuthProvider.credential(address, password)
    );

    expect(linked.user.uid).toBe(guestUid);
    expect(linked.user.isAnonymous).toBe(false);
    expect(linked.user.email).toBe(address);

    const kept = await getDoc(doc(db, `users/${guestUid}/progress/seed-sky-darkness`));
    expect(kept.exists()).toBe(true);
    expect(kept.data()?.status).toBe('completed');
  });

  it('returns the reader to the same uid when they sign in again later', async () => {
    const guest = await signInAnonymously(auth);
    const guestUid = guest.user.uid;
    const address = email();

    await linkWithCredential(guest.user, EmailAuthProvider.credential(address, password));
    await signOut(auth);

    const returning = await signInWithEmailAndPassword(auth, address, password);
    expect(returning.user.uid).toBe(guestUid);
  });

  // The failure this whole flow exists to prevent.
  it('is not what a plain create-account call does', async () => {
    const guest = await signInAnonymously(auth);
    const guestUid = guest.user.uid;

    const created = await createUserWithEmailAndPassword(auth, email(), password);

    expect(created.user.uid).not.toBe(guestUid);
  });

  it('refuses to link an email that already belongs to another account', async () => {
    const address = email();
    await createUserWithEmailAndPassword(auth, address, password);
    await signOut(auth);

    const guest = await signInAnonymously(auth);
    await expect(
      linkWithCredential(guest.user, EmailAuthProvider.credential(address, password))
    ).rejects.toMatchObject({ code: expect.stringContaining('already-in-use') });
  });
});

import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';

/**
 * The admin talks to the same backend the app does, with one difference: it is
 * the only client that may call the publish functions, and only because its
 * user carries an editorial custom claim. Rules and the functions decide that —
 * hiding a button is not authorization.
 */
const useEmulator = import.meta.env.VITE_USE_EMULATOR !== '0';

const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? 'demo-key',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? 'demo-dananeh',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
});

export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, 'europe-west1');

if (useEmulator) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8181);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}

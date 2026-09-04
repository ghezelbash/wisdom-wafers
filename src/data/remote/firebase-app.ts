import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  initializeAuth,
  // @ts-expect-error — not in the web typings, but present in the RN entry point.
  getReactNativePersistence,
  type Auth,
} from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore';
import { connectStorageEmulator, getStorage, type FirebaseStorage } from 'firebase/storage';
import { Platform } from 'react-native';

/**
 * The only place Firebase is constructed.
 *
 * Everything above this file talks to repositories, so swapping the JS SDK for
 * React Native Firebase later is a change here and in the adapters — not in a
 * screen. See `docs/adr/0005-firebase-js-sdk-behind-adapters.md`.
 */

const config = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

/** Development can point at the emulator suite instead of any real project. */
export const usingEmulator = process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATOR === '1';

const EMULATOR_HOST = process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST ?? '127.0.0.1';

/** A `demo-` project is never backed by a real one, so emulator mode cannot
 *  reach production even if real credentials are present in the environment. */
const EMULATOR_PROJECT = process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_PROJECT ?? 'demo-dananeh';

/**
 * A development build talks to a real project only when told to.
 *
 * Anonymous sign-in creates real accounts, so a stray `npm run web` must not
 * reach production just because credentials happen to be in `.env`. Development
 * either points at the emulator, opts in explicitly, or runs on a device-local
 * identity.
 */
const allowLiveProject = !__DEV__ || process.env.EXPO_PUBLIC_ALLOW_LIVE_FIREBASE === '1';

/** True when there is enough configuration to talk to Firebase at all. */
export const isFirebaseConfigured =
  usingEmulator || (allowLiveProject && Boolean(config.apiKey && config.projectId));

let app: FirebaseApp | undefined;
let authInstance: Auth | undefined;
let firestoreInstance: Firestore | undefined;
let storageInstance: FirebaseStorage | undefined;

function getApp(): FirebaseApp {
  if (!app) {
    app = getApps().length
      ? getApps()[0]
      : initializeApp(
          usingEmulator
            ? {
                ...config,
                apiKey: config.apiKey ?? 'demo-key',
                projectId: EMULATOR_PROJECT,
                // The bucket has to follow the project. Left alone it kept the
                // name from `.env`, so emulator mode addressed a bucket named
                // after whatever real project was configured — which the
                // emulator happens to serve anyway, hiding the mistake until
                // something looked at the URL.
                storageBucket: `${EMULATOR_PROJECT}.appspot.com`,
              }
            : config
        );
  }
  return app;
}

export function getFirebaseAuth(): Auth {
  if (!authInstance) {
    const instance = getApp();
    authInstance =
      Platform.OS === 'web'
        ? getAuth(instance)
        : initializeAuth(instance, { persistence: getReactNativePersistence(AsyncStorage) });

    if (usingEmulator) {
      connectAuthEmulator(authInstance, `http://${EMULATOR_HOST}:9099`, { disableWarnings: true });
    }
  }
  return authInstance;
}

export function getDb(): Firestore {
  if (!firestoreInstance) {
    firestoreInstance = getFirestore(getApp());
    if (usingEmulator) {
      connectFirestoreEmulator(firestoreInstance, EMULATOR_HOST, 8181);
    }
  }
  return firestoreInstance;
}

/** Published bundles live here. Object paths are resolved through the SDK, never
 *  fetched as if they were URLs — see `bundle-storage.ts`. */
export function getStorageBucket(): FirebaseStorage {
  if (!storageInstance) {
    storageInstance = getStorage(getApp());
    if (usingEmulator) {
      connectStorageEmulator(storageInstance, EMULATOR_HOST, 9199);
    }
  }
  return storageInstance;
}

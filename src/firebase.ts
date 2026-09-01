import { initializeApp, getApps } from 'firebase/app';
// @ts-ignore
import { getAuth, initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const firebaseConfig = {
  // TODO: Replace these with your actual Firebase project config
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'demo-api-key',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 'demo-auth-domain',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'demo-project-id',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || 'demo-storage-bucket',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || 'demo-sender-id',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || 'demo-app-id',
};

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Initialize Auth
// @ts-ignore
const auth = initializeAuth(app, {
  persistence: Platform.OS !== 'web' ? getReactNativePersistence(AsyncStorage) : undefined
});

// Initialize Firestore
const db = getFirestore(app);

export { app, auth, db };

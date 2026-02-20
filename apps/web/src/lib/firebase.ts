import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

function getFirebaseApp(): FirebaseApp {
  if (getApps().length > 0) {
    return getApps()[0];
  }
  return initializeApp(firebaseConfig);
}

const app = getFirebaseApp();
export const auth: Auth = getAuth(app);
export const storage: FirebaseStorage = getStorage(app);

export async function getFirebaseAnalytics() {
  if (typeof window === 'undefined') return null;
  const { getAnalytics, isSupported } = await import('firebase/analytics');
  const supported = await isSupported();
  if (!supported) return null;
  return getAnalytics(app);
}

export async function getFirebaseMessaging() {
  if (typeof window === 'undefined') return null;
  const { getMessaging, isSupported } = await import('firebase/messaging');
  const supported = await isSupported();
  if (!supported) return null;
  return getMessaging(app);
}

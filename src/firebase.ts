import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? 'AIzaSyB_oEiBDTtN_nXNWMjyBOIdlrNQJen-15o',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? 'livewrite-4c2aa.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? 'livewrite-4c2aa',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? 'livewrite-4c2aa.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '864973815094',
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '1:864973815094:web:f014e0212f8cdae1904797',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID ?? 'G-22SMHXMZ27',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const signInExamStudent = () => signInAnonymously(auth);

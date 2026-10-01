import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { createSignIn, createWhenAuthed, listenAfterAuth } from './authGate';

const firebaseConfig = {
  apiKey: import.meta.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: import.meta.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: import.meta.env.REACT_APP_FIREBASE_MEASUREMENT_ID,
};

let app; let auth; let db; let storage; let authReady;

const required = [
  firebaseConfig.apiKey,
  firebaseConfig.projectId,
  firebaseConfig.appId,
];

if (required.every(Boolean)) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  // Anonymous sign-in for simple access control
  authReady = new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) { unsub(); resolve(u); }
    });
  });
  // Retried after a rejection (backoff, and when the network comes back), never while one is pending
  const signIn = createSignIn({
    signIn: () => signInAnonymously(auth),
    hasUser: () => !!auth.currentUser,
    isOnline: () => typeof navigator === 'undefined' || navigator.onLine !== false,
    onError: (e) => console.warn('Anonymous auth failed', e),
  });
  signIn();
  if (typeof window !== 'undefined') window.addEventListener('online', () => { signIn(); });
  db = getFirestore(app);
  // Enable offline persistence where possible
  enableIndexedDbPersistence(db).catch((err) => {
    // err.code can be 'failed-precondition' (multiple tabs) or 'unimplemented' (browser)
    console.warn('Firestore persistence not enabled:', err?.code || err);
  });
  storage = getStorage(app);
  // An upload that keeps failing gives up after 2 min instead of the SDK's 10 (uploadPhoto stops waiting at 45 s)
  storage.maxUploadRetryTime = 2 * 60 * 1000;
} else {
  console.warn('Firebase config missing (REACT_APP_*) — skipping initialization for now.');
  authReady = Promise.resolve(null);
}

// The session, or null after `ms` (Infinity = no cap). Shared by every module instead of its own waitAuth
const whenAuthed = createWhenAuthed(authReady, () => auth?.currentUser);
// listenWhenAuthed(start, onError): sync unsubscribe for a listener that needs the session (see authGate)
const listenWhenAuthed = (start, onError) => listenAfterAuth(whenAuthed, start, onError);

export { app, auth, db, storage, authReady, whenAuthed, listenWhenAuthed };

import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, enableIndexedDbPersistence } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
  measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID,
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
  signInAnonymously(auth).catch((e) => console.warn('Anonymous auth failed', e));
  db = getFirestore(app);
  // Enable offline persistence where possible
  enableIndexedDbPersistence(db).catch((err) => {
    // err.code can be 'failed-precondition' (multiple tabs) or 'unimplemented' (browser)
    console.warn('Firestore persistence not enabled:', err?.code || err);
  });
  storage = getStorage(app);
} else {
  console.warn('Firebase config missing (REACT_APP_*) — skipping initialization for now.');
  authReady = Promise.resolve(null);
}

export { app, auth, db, storage, authReady };

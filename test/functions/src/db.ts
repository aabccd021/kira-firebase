import * as admin from 'firebase-admin';
import * as firebaseTesting from '@firebase/testing';

const projectId = 'demo-kira';

admin.initializeApp({ projectId });

export function getApp(): admin.app.App {
  process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
  process.env.FIREBASE_FIRESTORE_EMULATOR_ADDRESS = 'localhost:8080';
  return admin.app();
}

export function clearDb(): Promise<void> {
  return firebaseTesting.clearFirestoreData({ projectId });
}

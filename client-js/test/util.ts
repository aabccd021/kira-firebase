import { initializeApp } from 'firebase/app';
import { getFirestore, useFirestoreEmulator } from 'firebase/firestore/lite';

const firebaseApp = initializeApp({ projectId: 'demo-kira' });

export const firestore = getFirestore(firebaseApp);

useFirestoreEmulator(firestore, 'localhost', 8080);

export function sleep(milli: number): Promise<unknown> {
  return new Promise((res) => setTimeout(res, milli));
}

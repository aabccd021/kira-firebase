import { initializeApp } from 'firebase/app';
import { getFirestore, useFirestoreEmulator } from 'firebase/firestore/lite';

const firebaseApp = initializeApp({ projectId: 'demo-kira' });

export const firestore = getFirestore(firebaseApp);

useFirestoreEmulator(firestore, 'localhost', 8080);

export function sleep(milli: number): Promise<unknown> {
  return new Promise((res) => setTimeout(res, milli));
}

export function almostEqualTimeWith(x2: number): (x1: unknown) => boolean {
  return (x1) => x1 instanceof Date && x1.getTime() - x2 < 2000 && x1.getTime() - x2 >= 0;
}

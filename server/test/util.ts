/* eslint-disable import/first */
import * as admin from 'firebase-admin';
const projectId = 'demo-kira-firebase';
admin.initializeApp({ projectId });

import 'jest-extended';

import * as functions from 'firebase-functions';
import { Change } from 'firebase-functions';
import { QueryDocumentSnapshot } from 'firebase-functions/lib/providers/firestore';
import * as functionsTest from 'firebase-functions-test';
import { DocKey } from 'kira-core';
import { Dict } from 'trimop';

export const test = functionsTest({ projectId });

export async function createDoc(
  key: DocKey,
  snapshot: Dict<unknown>,
  trigger?: functions.CloudFunction<QueryDocumentSnapshot>
): Promise<void> {
  if (trigger === undefined) {
    throw Error();
  }
  const ref = `/${key.col}/${key.id}`;
  await admin.firestore().doc(ref).set(snapshot);
  await test.wrap(trigger)(test.firestore.makeDocumentSnapshot(snapshot, ref));
}

export async function setMergeDoc(
  key: DocKey,
  snapshot: Dict<unknown>,
  trigger?: functions.CloudFunction<Change<QueryDocumentSnapshot>>
): Promise<void> {
  if (trigger === undefined) {
    throw Error();
  }
  const ref = `/${key.col}/${key.id}`;

  const docRef = admin.firestore().doc(ref);

  const before = (await docRef.get().then((snap) => snap.data())) ?? {};
  await docRef.set(snapshot, { merge: true });
  const after = (await docRef.get().then((snap) => snap.data())) ?? {};

  await test.wrap(trigger)(
    test.makeChange<QueryDocumentSnapshot>(
      test.firestore.makeDocumentSnapshot(before, ref),
      test.firestore.makeDocumentSnapshot(after, ref)
    )
  );
}

export async function getDoc(key: DocKey): Promise<admin.firestore.DocumentData | undefined> {
  return admin
    .firestore()
    .collection(key.col)
    .doc(key.id)
    .get()
    .then((snap) => snap.data());
}

export function sleep(milli: number): Promise<unknown> {
  return new Promise((res) => setTimeout(res, milli));
}

export function almostEqualTimeWith(x2: number | undefined): (x1: unknown) => boolean {
  if (x2 === undefined) {
    throw Error('x2 is undefined');
  }
  return (x1) => {
    if (x1 instanceof admin.firestore.Timestamp) {
      const diff = x1.toDate().getTime() - x2;
      const result = diff < 4000 && diff >= 0;
      if (result) {
        return true;
      }
      console.error(`${diff}`);
      return false;
    }
    console.error(JSON.stringify(x1));
    return false;
  };
}

/* eslint-disable import/first */
import * as admin from 'firebase-admin';
const projectId = 'demo-kira-firebase';
admin.initializeApp({ projectId });

import 'jest-extended';

import * as functions from 'firebase-functions';
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
    // eslint-disable-next-line functional/no-throw-statement
    throw Error();
  }
  const ref = `/${key.col}/${key.id}`;
  await admin.firestore().doc(ref).set(snapshot);
  await test.wrap(trigger)(test.firestore.makeDocumentSnapshot(snapshot, ref));
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

export function almostEqualTimeWith(x2: number): (x1: unknown) => boolean {
  return (x1) => x1 instanceof Date && x1.getTime() - x2 < 2000 && x1.getTime() - x2 >= 0;
}

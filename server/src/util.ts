import assertNever from 'assert-never';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { DocumentBuilder, QueryDocumentSnapshot } from 'firebase-functions/lib/providers/firestore';
import {
  Either,
  GetDoc,
  ReadDocData,
  ReadDocSnapshot,
  ReadField,
  Schema,
  WriteDocData,
} from 'kira-nosql';

import {
  FirebaseTriggerDict,
  FirestoreReadDocData,
  FirestoreWriteDocData,
  FirestoreWriteField,
} from './type';

function firestoreToSnapshot(docSnapshot: QueryDocumentSnapshot): ReadDocSnapshot {
  return {
    id: docSnapshot.id,
    data: firestoreToReadDocData(docSnapshot.data()),
  };
}

function isStringArray(arr: unknown): arr is readonly string[] {
  return Array.isArray(arr) && typeof arr[0] === 'string';
}

export function firestoreToReadDocData(data: FirestoreReadDocData | undefined): ReadDocData {
  return Object.fromEntries(
    Object.entries(data ?? {}).map<readonly [string, ReadField]>(([fieldName, field]) => {
      if (typeof field === 'string') {
        return [fieldName, { type: 'string', value: field }];
      }
      if (typeof field === 'number') {
        return [fieldName, { type: 'number', value: field }];
      }
      if (field instanceof admin.firestore.Timestamp) {
        return [fieldName, { type: 'date', value: field.toDate() }];
      }
      if (isStringArray(field)) {
        return [fieldName, { type: 'stringArray', value: field }];
      }
      return [
        fieldName,
        { type: 'ref', value: { id: field.id, data: firestoreToReadDocData(field) } },
      ];
    })
  );
}

export function writeToFirestoreDocData(data: WriteDocData): FirestoreWriteDocData {
  return Object.fromEntries(
    Object.entries(data).map<readonly [string, FirestoreWriteField]>(([fieldName, field]) => {
      if (
        field.type === 'number' ||
        field.type === 'string' ||
        field.type === 'date' ||
        field.type === 'stringArray'
      ) {
        return [fieldName, field.value];
      }
      if (field.type === 'increment') {
        return [fieldName, admin.firestore.FieldValue.increment(field.incrementValue)];
      }
      if (field.type === 'creationTime') {
        return [fieldName, admin.firestore.FieldValue.serverTimestamp()];
      }
      if (field.type === 'ref') {
        return [fieldName, writeToFirestoreDocData(field.value)];
      }
      assertNever(field);
    })
  );
}

type GetDocError = Error;

/**
 * Prevent infinite loop
 */
export async function shouldRunTrigger(snapshot: QueryDocumentSnapshot): Promise<boolean> {
  const fromClientFlag = '_fromClient';
  // Stop functions if has client flag
  if (snapshot.data()?.[fromClientFlag] !== true) {
    return false;
  }
  // Remove flag
  await snapshot.ref.set(
    {
      [fromClientFlag]: admin.firestore.FieldValue.delete(),
    },
    { merge: true }
  );
  return true;
}

export function getTriggers<S extends Schema>({
  firestore,
  schema,
  triggerRegions,
}: {
  readonly firestore: admin.firestore.Firestore;
  readonly schema: S;
  readonly triggerRegions?: readonly typeof functions.SUPPORTED_REGIONS[number][];
}): FirebaseTriggerDict {
  const getDoc: GetDoc<GetDocError> = async ({ col, id }) => {
    const docSnapshot = await firestore
      .collection(col)
      .doc(id)
      .get()
      .then<Either<admin.firestore.DocumentData | undefined, Error>>((docSnapshot) => ({
        tag: 'right',
        value: docSnapshot.data(),
      }))
      .catch<Either<admin.firestore.DocumentData | undefined, Error>>((error) => ({
        tag: 'left',
        error,
      }));
    if (docSnapshot.tag === 'left') {
      return docSnapshot;
    }
    return { tag: 'right', value: { id, data: firestoreToReadDocData(docSnapshot.value) } };
  };

  const writeDoc: WriteDoc<admin.firestore.WriteResult> = async ({ col, id }, writeDocData) => {
    return firestore
      .collection(col)
      .doc(id)
      .set(writeToFirestoreDocData(writeDocData), { merge: true });
  };

  return Object.fromEntries(
    Object.entries(schema.cols).map(([colName]) => {
      const docKey = `${colName}/{docId}`;

      const colTrigger: DocumentBuilder = triggerRegions
        ? functions.region(...triggerRegions).firestore.document(docKey)
        : functions.firestore.document(docKey);

      const colOnCreateActions = actions.onCreate?.[colName];
      const colOnUpdateActions = actions.onUpdate?.[colName];
      const colOnDeleteActions = actions.onDelete?.[colName];
      return [
        colName,
        {
          onCreate: colOnCreateActions
            ? colTrigger.onCreate(async (snapshot) => {
                if (await shouldRunTrigger(snapshot)) {
                  await handleTrigger({
                    getDoc,
                    actions: colOnCreateActions,
                    writeDoc,
                    snapshot: firestoreToSnapshot(snapshot),
                  });
                }
              })
            : undefined,
          onDelete: colOnDeleteActions
            ? colTrigger.onDelete((snapshot) =>
                handleTrigger({
                  getDoc,
                  actions: colOnDeleteActions,
                  writeDoc,
                  snapshot: firestoreToSnapshot(snapshot),
                })
              )
            : undefined,
          onUpdate: colOnUpdateActions
            ? colTrigger.onUpdate(async (snapshot) => {
                if (await shouldRunTrigger(snapshot.after)) {
                  await handleTrigger({
                    getDoc,
                    actions: colOnUpdateActions,
                    writeDoc,
                    snapshot: {
                      before: firestoreToSnapshot(snapshot.before),
                      after: firestoreToSnapshot(snapshot.after),
                    },
                  });
                }
              })
            : undefined,
        },
      ];
    })
  );
}

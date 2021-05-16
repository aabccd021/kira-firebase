import assertNever from 'assert-never';
import { firestore } from 'firebase-admin';
import { region } from 'firebase-functions';
import { QueryDocumentSnapshot } from 'firebase-functions/lib/providers/firestore';
import {
  Actions,
  Either,
  GetDoc,
  handleTrigger,
  ReadDocData,
  ReadDocSnapshot,
  ReadField,
  Schema,
  WriteDoc,
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

function firestoreToReadDocData(data: FirestoreReadDocData | undefined): ReadDocData {
  return Object.fromEntries(
    Object.entries(data ?? {}).map<readonly [string, ReadField]>(([fieldName, field]) => {
      if (typeof field === 'string') {
        return [fieldName, { type: 'string', value: field }];
      }
      if (typeof field === 'number') {
        return [fieldName, { type: 'number', value: field }];
      }
      if (field instanceof firestore.Timestamp) {
        return [fieldName, { type: 'date', value: field.toDate() }];
      }
      return [
        fieldName,
        { type: 'ref', value: { id: field.id, data: firestoreToReadDocData(field) } },
      ];
    })
  );
}

function writeToFirestoreDocData(data: WriteDocData): FirestoreWriteDocData {
  return Object.fromEntries(
    Object.entries(data).map<readonly [string, FirestoreWriteField]>(([fieldName, field]) => {
      if (field.type === 'number' || field.type === 'string' || field.type === 'date') {
        return [fieldName, field.value];
      }
      if (field.type === 'increment') {
        return [fieldName, firestore.FieldValue.increment(field.incrementValue)];
      }
      if (field.type === 'creationTime') {
        return [fieldName, firestore.FieldValue.serverTimestamp()];
      }
      if (field.type === 'ref') {
        return [fieldName, writeToFirestoreDocData(field.value)];
      }
      assertNever(field);
    })
  );
}

type GetDocError = Error;

export function getTriggers<S extends Schema>(
  actions: Actions<GetDocError>,
  firestore: firestore.Firestore,
  schema: S
): FirebaseTriggerDict {
  const getDoc: GetDoc<GetDocError> = async ({ col, id }) => {
    const docSnapshot = await firestore
      .collection(col)
      .doc(id)
      .get()
      .then<Either<firestore.DocumentData | undefined, Error>>((docSnapshot) => ({
        tag: 'right',
        value: docSnapshot.data(),
      }))
      .catch<Either<firestore.DocumentData | undefined, Error>>((error) => ({
        tag: 'left',
        error,
      }));
    if (docSnapshot.tag === 'left') {
      return docSnapshot;
    }
    return { tag: 'right', value: { id, data: firestoreToReadDocData(docSnapshot.value) } };
  };

  const writeDoc: WriteDoc<firestore.WriteResult> = async ({ col, id }, writeDocData) => {
    return firestore
      .collection(col)
      .doc(id)
      .set(writeToFirestoreDocData(writeDocData), { merge: true });
  };

  return Object.fromEntries(
    Object.entries(schema.cols).map(([colName]) => {
      const document = region('asia-southeast2').firestore.document(`${colName}/{docId}`);

      const colOnCreateActions = actions.onCreate?.[colName];
      const colOnUpdateActions = actions.onUpdate?.[colName];
      const colOnDeleteActions = actions.onDelete?.[colName];
      return [
        colName,
        {
          onCreate: colOnCreateActions
            ? document.onCreate((snapshot) =>
                handleTrigger({
                  getDoc,
                  actions: colOnCreateActions,
                  writeDoc,
                  snapshot: firestoreToSnapshot(snapshot),
                })
              )
            : undefined,
          onDelete: colOnDeleteActions
            ? document.onDelete((snapshot) =>
                handleTrigger({
                  getDoc,
                  actions: colOnDeleteActions,
                  writeDoc,
                  snapshot: firestoreToSnapshot(snapshot),
                })
              )
            : undefined,
          onUpdate: colOnUpdateActions
            ? document.onUpdate((firestoreSnapshot) =>
                handleTrigger({
                  getDoc,
                  actions: colOnUpdateActions,
                  writeDoc,
                  snapshot: {
                    before: firestoreToSnapshot(firestoreSnapshot.before),
                    after: firestoreToSnapshot(firestoreSnapshot.after),
                  },
                })
              )
            : undefined,
        },
      ];
    })
  );
}

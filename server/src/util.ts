import assertNever from 'assert-never';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { DocumentBuilder, QueryDocumentSnapshot } from 'firebase-functions/lib/providers/firestore';
import {
  ActionType,
  ColDrafts,
  DB,
  Dictionary,
  DocKey,
  Either,
  Field,
  getActionDrafts,
  getDraft,
  getTransactionCommit,
  isTriggerRequired,
  MakeDraft,
  ReadDocData,
  ReadDocSnapshot,
  ReadField,
  runMayFailOps,
  SnapshotOfActionType,
  WriteDocData,
} from 'kira-nosql';

import {
  FirebaseTriggerDict,
  FirestoreReadDocData,
  FirestoreWriteDocData,
  FirestoreWriteField,
} from './type';

type FieldValue = typeof admin.firestore.FieldValue;

function isStringArray(arr: unknown): arr is readonly string[] {
  return Array.isArray(arr) && typeof arr[0] === 'string';
}

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
    { [fromClientFlag]: admin.firestore.FieldValue.delete() },
    { merge: true }
  );
  return true;
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

function writeToFirestoreDocData({
  data,
  fieldValue,
}: {
  readonly data: WriteDocData;
  readonly fieldValue: FieldValue;
}): FirestoreWriteDocData {
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
        return [fieldName, fieldValue.increment(field.value)];
      }
      if (field.type === 'creationTime') {
        return [fieldName, fieldValue.serverTimestamp()];
      }
      if (field.type === 'stringArrayUnion') {
        return [fieldName, fieldValue.arrayUnion(field.value)];
      }
      if (field.type === 'ref') {
        return [fieldName, writeToFirestoreDocData({ data: field.value, fieldValue })];
      }
      assertNever(field);
    })
  );
}

function firestoreToSnapshot(snapshot: functions.firestore.QueryDocumentSnapshot): ReadDocSnapshot {
  return {
    id: snapshot.id,
    data: firestoreToReadDocData(snapshot.data()),
  };
}

type TriggerContext = {
  readonly getDocRef: GetDocRef;
  readonly makeBatch: MakeBatch;
  readonly db: DB<Error, admin.firestore.WriteResult>;
  readonly fieldValue: FieldValue;
};

type GetDocRef = (key: DocKey) => admin.firestore.DocumentReference;
type MakeBatch = () => admin.firestore.WriteBatch;

function makeGetDocRef(firestore: admin.firestore.Firestore): GetDocRef {
  return (key) => firestore.collection(key.col).doc(key.id);
}

async function runTrigger<A extends ActionType>({
  context: { makeBatch, getDocRef, db, fieldValue },
  snapshot,
  draft,
}: {
  readonly context: TriggerContext;
  readonly snapshot: SnapshotOfActionType<A>;
  readonly draft: ColDrafts<A, Error, admin.firestore.WriteResult>;
}): Promise<void> {
  const transactionCommit = await getTransactionCommit({
    snapshot,
    draft,
    getDoc: db.getDoc,
  });
  if (transactionCommit.tag === 'left') {
    functions.logger.log('Failed to get transaction commit', transactionCommit);
    return;
  }
  const batch = makeBatch();
  Object.entries(transactionCommit.value).forEach(([colName, docs]) => {
    Object.entries(docs).forEach(([docId, docCommit]) => {
      const ref = getDocRef({ col: colName, id: docId });
      if (docCommit.op === 'merge') {
        batch.set(ref, writeToFirestoreDocData({ data: docCommit.data, fieldValue }), {
          merge: true,
        });
        return;
      }
      if (docCommit.op === 'delete') {
        batch.delete(ref);
        return;
      }
      assertNever(docCommit);
    });
  });
  const result = await batch
    .commit()
    .then<Either<readonly admin.firestore.WriteResult[], unknown>>((value) => ({
      tag: 'right',
      value,
    }))
    .catch<Either<readonly admin.firestore.WriteResult[], unknown>>((error) => ({
      tag: 'left',
      error,
    }));
  if (result.tag === 'left') {
    functions.logger.log('Failed batch write', transactionCommit);
    return;
  }
  runMayFailOps({ draft, snapshot, db });
}

export function getFirebaseTriggers<F extends Field>({
  firestore,
  fieldValue,
  cols,
  triggerRegions,
  makeDraft,
}: {
  readonly firestore: admin.firestore.Firestore;
  readonly fieldValue: FieldValue;
  readonly triggerRegions?: readonly typeof functions.SUPPORTED_REGIONS[number][];
  readonly version: {
    readonly 'kira-core': '0.3.8';
    readonly 'kira-firebase-server': '0.1.8';
  };
  readonly cols: Dictionary<Dictionary<F>>;
  readonly makeDraft: MakeDraft<F, Error, admin.firestore.WriteResult>;
}): FirebaseTriggerDict {
  const drafts = getDraft({ cols, makeDraft });

  const getDocRef = makeGetDocRef(firestore);

  const context: TriggerContext = {
    getDocRef,
    fieldValue,
    makeBatch: () => firestore.batch(),
    db: {
      getDoc: async ({ key }) => {
        const docSnapshot = await getDocRef(key)
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
        return {
          tag: 'right',
          value: { id: key.id, data: firestoreToReadDocData(docSnapshot.value) },
        };
      },
      mergeDoc: ({ key, docData }) =>
        getDocRef(key).set(writeToFirestoreDocData({ data: docData, fieldValue }), { merge: true }),
      deleteDoc: ({ key }) => getDocRef(key).delete(),
    },
  };

  return Object.fromEntries(
    Object.entries(cols).map(([colName]) => {
      const docKey = `${colName}/{docId}`;

      const colTrigger: DocumentBuilder = triggerRegions
        ? functions.region(...triggerRegions).firestore.document(docKey)
        : functions.firestore.document(docKey);

      const { onCreate, onUpdate, onDelete } = getActionDrafts({ drafts, colName });

      return [
        colName,
        {
          onCreate:
            onCreate !== undefined && isTriggerRequired(onCreate)
              ? colTrigger.onCreate(async (snapshot) => {
                  if (await shouldRunTrigger(snapshot)) {
                    await runTrigger({
                      context,
                      draft: onCreate,
                      snapshot: firestoreToSnapshot(snapshot),
                    });
                  }
                })
              : undefined,
          onUpdate:
            onUpdate !== undefined && isTriggerRequired(onUpdate)
              ? colTrigger.onUpdate(async (snapshot) => {
                  if (await shouldRunTrigger(snapshot.after)) {
                    await runTrigger({
                      context,
                      draft: onUpdate,
                      snapshot: {
                        id: snapshot.after.id,
                        before: firestoreToReadDocData(snapshot.before.data()),
                        after: firestoreToReadDocData(snapshot.after.data()),
                      },
                    });
                  }
                })
              : undefined,
          onDelete:
            onDelete !== undefined && isTriggerRequired(onDelete)
              ? colTrigger.onDelete(async (snapshot) => {
                  await runTrigger({
                    context,
                    draft: onDelete,
                    snapshot: firestoreToSnapshot(snapshot),
                  });
                })
              : undefined,
        },
      ];
    })
  );
}

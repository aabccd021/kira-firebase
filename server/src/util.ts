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
  RefWriteField,
  runMayFailOps,
  SnapshotOfActionType,
  WriteDocData,
  WriteField,
} from 'kira-nosql';

import {
  FirebaseTriggerDict,
  FirestoreReadDocData,
  FirestoreSetDocData,
  FirestoreSetField,
  FirestoreUpdateDocData,
  FirestoreUpdateField,
} from './type';

type FirestoreFieldValue = typeof admin.firestore.FieldValue;
type TransactionResult = { readonly success: boolean };
type RunTransaction = (
  updateFunction: (transaction: admin.firestore.Transaction) => Promise<void>
) => Promise<void>;

function isStringArray(arr: unknown): arr is readonly string[] {
  return Array.isArray(arr) && typeof arr[0] === 'string';
}

/**
 * Prevent infinite loop
 */
export async function shouldRunTrigger(snapshot: QueryDocumentSnapshot): Promise<boolean> {
  const FROM_CLIENT_FLAG = '_fromClient';
  // Stop functions if has client flag
  if (snapshot.data()?.[FROM_CLIENT_FLAG] !== true) {
    return false;
  }
  // Remove flag
  await snapshot.ref.update({ [FROM_CLIENT_FLAG]: admin.firestore.FieldValue.delete() });
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

function writeToFirestoreSetField({
  field,
  firestoreFieldValue,
}: {
  readonly field: WriteField;
  readonly firestoreFieldValue: FirestoreFieldValue;
}): FirestoreSetField {
  if (field.type === 'ref') {
    return writeToFirestoreSetDocData({ data: field.value, firestoreFieldValue });
  }
  return writeToFirestoreUpdateField({ field, firestoreFieldValue });
}

function writeToFirestoreUpdateField({
  field,
  firestoreFieldValue,
}: {
  readonly field: Exclude<WriteField, RefWriteField>;
  readonly firestoreFieldValue: FirestoreFieldValue;
}): FirestoreUpdateField {
  if (
    field.type === 'number' ||
    field.type === 'string' ||
    field.type === 'date' ||
    field.type === 'stringArray'
  ) {
    return field.value;
  }
  if (field.type === 'increment') {
    return firestoreFieldValue.increment(field.value);
  }
  if (field.type === 'creationTime') {
    return firestoreFieldValue.serverTimestamp();
  }
  if (field.type === 'stringArrayUnion') {
    return firestoreFieldValue.arrayUnion(field.value);
  }
  if (field.type === 'stringArrayRemove') {
    return firestoreFieldValue.arrayRemove(field.value);
  }
  assertNever(field);
}

function writeToFirestoreSetDocData({
  data,
  firestoreFieldValue,
}: {
  readonly data: WriteDocData;
  readonly firestoreFieldValue: FirestoreFieldValue;
}): FirestoreSetDocData {
  return Object.fromEntries(
    Object.entries(data).map<readonly [string, FirestoreSetField]>(([fieldName, field]) => [
      fieldName,
      writeToFirestoreSetField({ field, firestoreFieldValue }),
    ])
  );
}

function writeToFirestoreUpdateDocData({
  data,
  firestoreFieldValue,
}: {
  readonly data: WriteDocData;
  readonly firestoreFieldValue: FirestoreFieldValue;
}): FirestoreUpdateDocData {
  return Object.entries(data).reduce<FirestoreUpdateDocData>((prev, [fieldName, field]) => {
    if (field.type === 'ref') {
      return {
        ...prev,
        ...Object.fromEntries(
          Object.entries(
            writeToFirestoreUpdateDocData({ data: field.value, firestoreFieldValue })
          ).map(([subFieldName, subField]) => [`${fieldName}.${subFieldName}`, subField])
        ),
      };
    }
    return {
      ...prev,
      [fieldName]: writeToFirestoreUpdateField({ field, firestoreFieldValue }),
    };
  }, {});
}

function firestoreToSnapshot(snapshot: functions.firestore.QueryDocumentSnapshot): ReadDocSnapshot {
  return {
    id: snapshot.id,
    data: firestoreToReadDocData(snapshot.data()),
  };
}

type TriggerContext = {
  readonly getDocRef: GetDocRef;
  // readonly makeBatch: MakeBatch;
  readonly runTransaction: RunTransaction;
  readonly db: DB<Error, admin.firestore.WriteResult>;
  readonly firestoreFieldValue: FirestoreFieldValue;
};

type GetDocRef = (key: DocKey) => admin.firestore.DocumentReference;
// type MakeBatch = () => admin.firestore.WriteBatch;

async function runTrigger<A extends ActionType>({
  context: { runTransaction, getDocRef, db, firestoreFieldValue },
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
  functions.logger.log('transactionCommit', { transactionCommit });
  if (transactionCommit.tag === 'left') {
    functions.logger.error('Failed to get transaction commit', transactionCommit);
    return;
  }
  const transactionResult: TransactionResult = await runTransaction(async (t) => {
    const docsExistsDict = Object.fromEntries(
      await Promise.all(
        Object.entries(transactionCommit.value).map<
          Promise<readonly [string, Dictionary<boolean>]>
        >(async ([colName, colDocs]) => {
          return [
            colName,
            Object.fromEntries(
              await Promise.all(
                Object.entries(colDocs).map<Promise<readonly [string, boolean]>>(
                  async ([docId, docCommit]) => {
                    if (docCommit.op === 'update') {
                      const snapshot = await t.get(getDocRef({ col: colName, id: docId }));
                      return [docId, snapshot.exists];
                    }
                    return [docId, false];
                  }
                )
              )
            ),
          ];
        })
      )
    );
    Object.entries(transactionCommit.value).forEach(([colName, docs]) => {
      Object.entries(docs).forEach(([docId, docCommit]) => {
        const ref = getDocRef({ col: colName, id: docId });
        if (docCommit.op === 'update') {
          if (docCommit.onDocAbsent === 'doNotUpdate') {
            if (docsExistsDict[colName]?.[docId]) {
              t.update(
                ref,
                writeToFirestoreUpdateDocData({ data: docCommit.data, firestoreFieldValue })
              );
            }
            return;
          }
          if (docCommit.onDocAbsent === 'createDoc') {
            t.set(ref, writeToFirestoreSetDocData({ data: docCommit.data, firestoreFieldValue }), {
              merge: true,
            });
            return;
          }
          assertNever(docCommit.onDocAbsent);
        }
        if (docCommit.op === 'delete') {
          t.delete(ref);
          return;
        }
        assertNever(docCommit);
      });
    });
  })
    .then(() => ({ success: true }))
    .catch(() => ({ success: false }));
  if (!transactionResult.success) {
    functions.logger.error('Transaction Failed');
    return;
  }
  runMayFailOps({ draft, snapshot, db });
}

export function getFirebaseTriggers<F extends Field>({
  firestore,
  firestoreFieldValue: firestoreFieldValue,
  cols,
  triggerRegions,
  makeDraft,
}: {
  readonly firestore: admin.firestore.Firestore;
  readonly firestoreFieldValue: FirestoreFieldValue;
  readonly triggerRegions?: readonly typeof functions.SUPPORTED_REGIONS[number][];
  readonly version: {
    readonly 'kira-core': '0.3.8';
    readonly 'kira-firebase-server': '0.1.8';
  };
  readonly cols: Dictionary<Dictionary<F>>;
  readonly makeDraft: MakeDraft<F, Error, admin.firestore.WriteResult>;
}): FirebaseTriggerDict {
  const drafts = getDraft({ cols, makeDraft });

  const getDocRef: GetDocRef = (key) => firestore.collection(key.col).doc(key.id);

  const context: TriggerContext = {
    getDocRef,
    firestoreFieldValue: firestoreFieldValue,
    runTransaction: (params) => firestore.runTransaction(params),
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
        functions.logger.log('getDoc', { docSnapshot, key });
        if (docSnapshot.tag === 'left') {
          return docSnapshot;
        }
        return {
          tag: 'right',
          value: { id: key.id, data: firestoreToReadDocData(docSnapshot.value) },
        };
      },
      updateDoc: async ({ key, docData }) => {
        const res = await getDocRef(key).update(
          writeToFirestoreUpdateDocData({ data: docData, firestoreFieldValue })
        );
        functions.logger.log('updateDoc', { res, docData, key });
        return res;
      },
      deleteDoc: async ({ key }) => {
        const wr = await getDocRef(key).delete();
        functions.logger.log('deleteDoc', { key, wr });
        return wr;
      },
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

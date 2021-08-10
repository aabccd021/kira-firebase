import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { DocumentBuilder } from 'firebase-functions/lib/providers/firestore';
import { Doc, DocKey, FieldSpec } from 'kira-core';
import {
  ActionTrigger,
  BuildDraft,
  ColTrigger,
  execPropagationOps,
  GetDocError,
  getTransactionCommit,
  getTrigger,
  TriggerSnapshot,
} from 'kira-nosql';
import {
  Dict,
  Either,
  eitherFold,
  eitherMapRight,
  isLeft,
  isRight,
  Left,
  optionFold,
  optionFromNullable,
  Right,
} from 'trimop';

import { firestoreToDoc } from './firestore-to-doc';
import { shouldRunTrigger } from './should-run-trigger';
import {
  ColFirebaseTrigger,
  FirebaseDeleteDocError,
  FirebaseGetDocError,
  FirebaseTrigger,
  FirebaseUpdateDocError,
  FirestoreFieldValue,
  FirestoreToDocError,
  FirestoreToDocGetDocError,
  ID_FIELD,
  TransactionResult,
} from './type';
import { writeToFirestoreUpdateDocData } from './write-to-firestore-doc';

type GetDocRef = (key: DocKey) => admin.firestore.DocumentReference;

async function runTrigger<S extends TriggerSnapshot>({
  actionTrigger,
  snapshot,
  firestore,
  firestoreFieldValue,
}: {
  readonly actionTrigger: ActionTrigger<S>;
  readonly firestore: admin.firestore.Firestore;
  readonly firestoreFieldValue: FirestoreFieldValue;
  readonly snapshot: S;
}): Promise<void> {
  const getDocRef: GetDocRef = (key) => firestore.collection(key.col).doc(key.id);

  const transactionCommit = await getTransactionCommit<S>({
    actionTrigger,
    getDoc: async (key) =>
      eitherMapRight(
        await getDocRef(key)
          .get()
          .then((docSnapshot) =>
            Right(
              optionFold(
                optionFromNullable(docSnapshot.data()),
                () => ({}),
                (doc) => doc
              )
            )
          )
          .catch((reason) => Left(FirebaseGetDocError({ reason }))),
        (doc) =>
          eitherFold<Either<GetDocError, Doc>, FirestoreToDocError, Doc>(
            firestoreToDoc(doc),
            (left) => Left(FirestoreToDocGetDocError({ ...left })),
            (doc) => Right(doc)
          )
      ),
    snapshot,
  });
  if (isLeft(transactionCommit)) {
    functions.logger.error('Failed to get transaction commit', {
      actionTrigger,
      snapshot,
      transactionCommit,
    });
    // TODO: revert trigger operation. (e.g. reverse update, delete if created, create if deleted)
    return;
  }
  const transactionResult: TransactionResult = await firestore
    .runTransaction(async (transaction) => {
      /**
       * Gathers information wether document with commit `onDocAbsent === 'doNotUpdate'` exists.
       * All reads in transaction need to be done before any writes.
       */
      const docsExistsDict = Object.fromEntries(
        await Promise.all(
          Object.entries(transactionCommit.right).map<Promise<readonly [string, Dict<boolean>]>>(
            async ([colName, colDocs]) => [
              colName,
              Object.fromEntries(
                await Promise.all(
                  Object.entries(colDocs).map<Promise<readonly [string, boolean]>>(
                    async ([docId]) => {
                      // if (docCommit._op === 'Update' &&
                      // docCommit.onDocAbsent === 'doNotUpdate') {
                      const snapshot = await transaction.get(
                        getDocRef({ col: colName, id: docId })
                      );
                      return [docId, snapshot.exists];
                      // }
                      // return [docId, false];
                    }
                  )
                )
              ),
            ]
          )
        )
      );
      // Write transactions
      Object.entries(transactionCommit.right).forEach(([colName, docs]) => {
        Object.entries(docs).forEach(([docId, docCommit]) => {
          const ref = getDocRef({ col: colName, id: docId });
          if (docCommit._op === 'Update') {
            if (docCommit.onDocAbsent === 'doNotUpdate') {
              const docExists = docsExistsDict[colName]?.[docId] ?? false;
              if (docExists) {
                transaction.update(
                  ref,
                  writeToFirestoreUpdateDocData({
                    firestoreFieldValue,
                    writeDoc: docCommit.writeDoc,
                  })
                );
              }
            }
            // if (docCommit.onDocAbsent === 'createDoc') {
            //   transaction.set(
            //     ref,
            //     writeToFirestoreSetDocData({ firestoreFieldValue,
            // writeDoc: docCommit.writeDoc }),
            //     {
            //       merge: true,
            //     }
            //   );
            // }
          }
        });
      });
    })
    .then(() => ({ success: true }))
    .catch(() => ({ success: false }));
  if (!transactionResult.success) {
    functions.logger.error('Failed to get transaction commit', {
      actionTrigger,
      snapshot,
      transactionCommit,
    });
    // TODO: revert trigger operation. (e.g. reverse update, delete if created, create if deleted)
    return;
  }
  execPropagationOps({
    actionTrigger,
    deleteDoc: (key) =>
      getDocRef(key)
        .delete()
        .then((writeResult) => Right(writeResult))
        .catch((reason) => Left(FirebaseDeleteDocError({ reason }))),
    execOnRelDocs: ({ refedId, referCol, referField }, exec) =>
      firestore
        .collection(referCol)
        .where(`${referField}.${ID_FIELD}`, '==', refedId)
        .get()
        .then((querySnapshot) => Promise.all(querySnapshot.docs.map(({ id }) => exec(id)))),
    snapshot,
    updateDoc: ({ key, writeDoc }) =>
      getDocRef(key)
        .update(writeToFirestoreUpdateDocData({ firestoreFieldValue, writeDoc }))
        .then((writeResult) => Right(writeResult))
        .catch((reason) => Left(FirebaseUpdateDocError({ reason }))),
  });
}

export function getFirebaseTriggers({
  firestore,
  firestoreFieldValue,
  spec,
  triggerRegions,
  buildDraft,
}: {
  readonly buildDraft: BuildDraft;
  readonly firestore: admin.firestore.Firestore;
  readonly firestoreFieldValue: FirestoreFieldValue;
  readonly spec: Dict<Dict<FieldSpec>>;
  readonly triggerRegions?: readonly typeof functions.SUPPORTED_REGIONS[number][];
}): FirebaseTrigger {
  const trigger = getTrigger({ buildDraft, spec });

  return Object.fromEntries(
    Object.entries(spec).map(([colName]) =>
      optionFold<readonly [string, ColFirebaseTrigger | undefined], ColTrigger>(
        optionFromNullable(trigger[colName]),
        () => [colName, undefined],
        (colTrigger) => {
          const docKey = `${colName}/{docId}`;

          const firestoreColTrigger: DocumentBuilder = triggerRegions
            ? functions.region(...triggerRegions).firestore.document(docKey)
            : functions.firestore.document(docKey);

          return [
            colName,
            {
              onCreate: optionFold(
                colTrigger.onCreate,
                () => undefined,
                (onCreateTrigger) =>
                  firestoreColTrigger.onCreate(async (snapshot) => {
                    if (await shouldRunTrigger(snapshot)) {
                      const doc = firestoreToDoc(snapshot.data());
                      if (isRight(doc)) {
                        await runTrigger({
                          actionTrigger: onCreateTrigger,
                          firestore,
                          firestoreFieldValue,
                          snapshot: {
                            doc: doc.right,
                            id: snapshot.id,
                          },
                        });
                      }
                    }
                  })
              ),
              onDelete: optionFold(
                colTrigger.onDelete,
                () => undefined,
                (onDeleteTrigger) =>
                  firestoreColTrigger.onDelete(async (snapshot) => {
                    const doc = firestoreToDoc(snapshot.data());
                    if (isRight(doc)) {
                      await runTrigger({
                        actionTrigger: onDeleteTrigger,
                        firestore,
                        firestoreFieldValue,
                        snapshot: {
                          doc: doc.right,
                          id: snapshot.id,
                        },
                      });
                    }
                  })
              ),
              onUpdate: optionFold(
                colTrigger.onUpdate,
                () => undefined,
                (onUpdateTrigger) =>
                  firestoreColTrigger.onUpdate(async (snapshot) => {
                    if (await shouldRunTrigger(snapshot.after)) {
                      const before = firestoreToDoc(snapshot.before.data());
                      const after = firestoreToDoc(snapshot.after.data());
                      if (isRight(before) && isRight(after)) {
                        await runTrigger({
                          actionTrigger: onUpdateTrigger,
                          firestore,
                          firestoreFieldValue,
                          snapshot: {
                            after: after.right,
                            before: before.right,
                            id: snapshot.after.id,
                          },
                        });
                      }
                    }
                  })
              ),
            },
          ];
        }
      )
    )
  );
}

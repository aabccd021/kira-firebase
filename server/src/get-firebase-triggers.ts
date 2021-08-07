import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { DocumentBuilder } from 'firebase-functions/lib/providers/firestore';
import { Doc, DocKey, FieldSpec } from 'kira-core';
import {
  ActionTrigger,
  BuildDraft,
  ColTrigger,
  DeleteDoc,
  ExecOnRelDocs,
  execPropagationOps,
  GetDoc,
  getTransactionCommit,
  getTrigger,
  TriggerSnapshot,
  UpdateDoc,
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

import { firestoreToDoc, FirestoreToDocError } from './firestore-to-doc';
import { shouldRunTrigger } from './should-run-trigger';
import {
  ColFirebaseTrigger,
  FirebaseTrigger,
  FirestoreFieldValue,
  TransactionResult,
} from './type';
import {
  writeToFirestoreSetDocData,
  writeToFirestoreUpdateDocData,
} from './write-to-firestore-doc';

/**
 *
 */
export type FirebaseGetDocError = {
  readonly _getDocErrorType: 'FirebaseGetDoc';
  readonly _errorType: 'GetDocError';
  readonly reason: unknown;
};

export function FirebaseGetDocError(
  p: Omit<FirebaseGetDocError, '_errorType' | '_getDocErrorType'>
): FirebaseGetDocError {
  return {
    ...p,
    _errorType: 'GetDocError',
    _getDocErrorType: 'FirebaseGetDoc',
  };
}

/**
 *
 */
export type FirebaseUpdateDocError = {
  readonly _updateDocErrorType: 'FirebaseUpdateDoc';
  readonly _errorType: 'UpdateDocError';
  readonly reason: unknown;
};

export function FirebaseUpdateDocError(
  p: Omit<FirebaseUpdateDocError, '_errorType' | '_updateDocErrorType'>
): FirebaseUpdateDocError {
  return {
    ...p,
    _errorType: 'UpdateDocError',
    _updateDocErrorType: 'FirebaseUpdateDoc',
  };
}

/**
 *
 */
export type FirestoreToDocGetDocError = FirestoreToDocError & {
  readonly _getDocErrorType: 'FirestoreToDocGetDoc';
  readonly _errorType: 'GetDocError';
};

export function FirestoreToDocGetDocError(
  p: Omit<FirestoreToDocGetDocError, '_errorType' | '_getDocErrorType'>
): FirestoreToDocGetDocError {
  return {
    ...p,
    _errorType: 'GetDocError',
    _getDocErrorType: 'FirestoreToDocGetDoc',
  };
}

/**
 *
 */
export type GetDocError = FirebaseGetDocError | FirestoreToDocGetDocError;

/**
 *
 */
export type FirebaseDeleteDocError = {
  readonly _deleteDocErrorType: 'FirebaseDeleteDoc';
  readonly _errorType: 'DeleteDocError';
  readonly reason: unknown;
};

export function FirebaseDeleteDocError(
  p: Omit<FirebaseDeleteDocError, '_errorType' | '_deleteDocErrorType'>
): FirebaseDeleteDocError {
  return {
    ...p,
    _errorType: 'DeleteDocError',
    _deleteDocErrorType: 'FirebaseDeleteDoc',
  };
}

type GetDocRef = (key: DocKey) => admin.firestore.DocumentReference;

async function runTrigger<S extends TriggerSnapshot>({
  actionTrigger,
  snapshot,
  firestore,
  firestoreFieldValue,
}: {
  readonly actionTrigger: ActionTrigger<S>;
  readonly firestoreFieldValue: FirestoreFieldValue;
  readonly firestore: admin.firestore.Firestore;
  readonly snapshot: S;
}): Promise<void> {
  const getDocRef: GetDocRef = (key) => firestore.collection(key.col).doc(key.id);

  // runTransaction: (params) => firestore.runTransaction(params),
  // db: {
  const getDoc: GetDoc<GetDocError> = async (key) =>
    eitherMapRight(
      await getDocRef(key)
        .get()
        .then((docSnapshot) => Right(optionFromNullable(docSnapshot.data())))
        .catch((reason) => Left(FirebaseGetDocError({ reason }))),
      (doc) =>
        eitherFold<Either<GetDocError, Doc>, FirestoreToDocError, Doc>(
          firestoreToDoc(doc),
          (left) => Left(FirestoreToDocGetDocError({ ...left })),
          (doc) => Right(doc)
        )
    );

  const updateDoc: UpdateDoc<FirebaseUpdateDocError> = ({ key, writeDoc }) =>
    getDocRef(key)
      .update(writeToFirestoreUpdateDocData({ writeDoc, firestoreFieldValue }))
      .then((writeResult) => Right(writeResult))
      .catch((reason) => Left(FirebaseUpdateDocError({ reason })));

  const deleteDoc: DeleteDoc<FirebaseDeleteDocError> = (key) =>
    getDocRef(key)
      .delete()
      .then((writeResult) => Right(writeResult))
      .catch((reason) => Left(FirebaseDeleteDocError({ reason })));

  const execOnRelDocs: ExecOnRelDocs = ({ refedId, referCol, referField }, exec) =>
    firestore
      .collection(referCol)
      .where(`${referField}._id`, '==', refedId)
      .get()
      .then((querySnapshot) => Promise.all(querySnapshot.docs.map(({ id }) => exec(id))));

  const transactionCommit = await getTransactionCommit<S>({
    actionTrigger,
    snapshot,
    getDoc,
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
                    async ([docId, docCommit]) => {
                      if (docCommit._op === 'Update' && docCommit.onDocAbsent === 'doNotUpdate') {
                        const snapshot = await transaction.get(
                          getDocRef({ col: colName, id: docId })
                        );
                        return [docId, snapshot.exists];
                      }
                      return [docId, false];
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
                    writeDoc: docCommit.writeDoc,
                    firestoreFieldValue,
                  })
                );
              }
              return;
            }
            if (docCommit.onDocAbsent === 'createDoc') {
              transaction.set(
                ref,
                writeToFirestoreSetDocData({ writeDoc: docCommit.writeDoc, firestoreFieldValue }),
                {
                  merge: true,
                }
              );
              return;
            }
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
    snapshot,
    deleteDoc,
    execOnRelDocs,
    updateDoc,
  });
}

export function getFirebaseTriggers({
  firestore,
  firestoreFieldValue,
  spec,
  triggerRegions,
  buildDraft,
}: {
  readonly firestore: admin.firestore.Firestore;
  readonly buildDraft: BuildDraft;
  readonly firestoreFieldValue: FirestoreFieldValue;
  readonly triggerRegions?: readonly typeof functions.SUPPORTED_REGIONS[number][];
  readonly spec: Dict<Dict<FieldSpec>>;
}): FirebaseTrigger {
  const trigger = getTrigger({ spec, buildDraft });

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
                      const doc = firestoreToDoc(optionFromNullable(snapshot.data()));
                      if (isRight(doc)) {
                        await runTrigger({
                          actionTrigger: onCreateTrigger,
                          firestore,
                          firestoreFieldValue,
                          snapshot: {
                            id: snapshot.id,
                            doc: doc.right,
                          },
                        });
                      }
                    }
                  })
              ),
              onUpdate: optionFold(
                colTrigger.onUpdate,
                () => undefined,
                (onUpdateTrigger) =>
                  firestoreColTrigger.onUpdate(async (snapshot) => {
                    if (await shouldRunTrigger(snapshot.after)) {
                      const before = firestoreToDoc(optionFromNullable(snapshot.before.data()));
                      const after = firestoreToDoc(optionFromNullable(snapshot.after.data()));
                      if (isRight(before) && isRight(after)) {
                        await runTrigger({
                          actionTrigger: onUpdateTrigger,
                          firestore,
                          firestoreFieldValue,
                          snapshot: {
                            id: snapshot.after.id,
                            before: before.right,
                            after: after.right,
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
                    const doc = firestoreToDoc(optionFromNullable(snapshot.data()));
                    if (isRight(doc)) {
                      await runTrigger({
                        actionTrigger: onDeleteTrigger,
                        firestore,
                        firestoreFieldValue,
                        snapshot: {
                          id: snapshot.id,
                          doc: doc.right,
                        },
                      });
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

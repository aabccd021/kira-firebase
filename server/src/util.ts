import assertNever from 'assert-never';
import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { DocumentBuilder, QueryDocumentSnapshot } from 'firebase-functions/lib/providers/firestore';
import {
  DeleteDoc,
  Dictionary,
  DocKey,
  Either,
  Field,
  GetDoc,
  GetTransactionCommit,
  MayFailOp,
  MergeDoc,
  ReadDocData,
  ReadField,
  SnapshotOfTriggerType,
  TriggerType,
  WriteDocData,
} from 'kira-nosql';

import { makeTrigger } from './field';
import {
  FirebaseTriggerDict,
  FirestoreReadDocData,
  FirestoreWriteDocData,
  FirestoreWriteField,
} from './type';

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
    {
      [fromClientFlag]: admin.firestore.FieldValue.delete(),
    },
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

function writeToFirestoreDocData(data: WriteDocData): FirestoreWriteDocData {
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

function getDocRef({
  firestore,
  key: { col, id },
}: {
  readonly firestore: admin.firestore.Firestore;
  readonly key: DocKey;
}): admin.firestore.DocumentReference {
  return firestore
    .collection(col.type === 'normal' ? col.name : '_relation')
    .doc(col.type === 'normal' ? id : `${col.referCol}_${col.referField}_${col.refedCol}_${id}`);
}

type X<T extends TriggerType, GDE, WR> = {
  readonly getTransactionCommit?: GetTransactionCommit<T, GDE>;
  readonly mayFailOp?: MayFailOp<T, GDE, WR>;
};

type Y<T extends TriggerType, GDE, WR> = {
  readonly getTransactionCommits: readonly GetTransactionCommit<T, GDE>[];
  readonly mayFailOps: readonly MayFailOp<T, GDE, WR>[];
};

function isDefined<T>(t: T | undefined): t is T {
  return t !== undefined;
}

function getTCAndMFO<T extends TriggerType, GDE, WR>(
  colsAction: readonly (X<T, GDE, WR> | undefined)[]
): Y<T, GDE, WR> {
  return {
    getTransactionCommits: colsAction.map((x) => x?.getTransactionCommit).filter(isDefined),
    mayFailOps: colsAction.map((x) => x?.mayFailOp).filter(isDefined),
  };
}

type DB = {
  readonly getDoc: GetDoc<Error>;
  readonly mergeDoc: MergeDoc<admin.firestore.WriteResult>;
  readonly deleteDoc: DeleteDoc<admin.firestore.WriteResult>;
};

async function runTrigger<T extends TriggerType>({
  action,
  snapshot,
  db,
}: {
  readonly action: Y<T, Error, admin.firestore.WriteResult>;
  readonly snapshot: SnapshotOfTriggerType<T>;
  readonly db: DB;
}): Promise<void> {
  const tc = await Promise.all(
    action.getTransactionCommits.map((gtc) => gtc({ ...db, snapshot }))
  ).then((eithers) =>
    eithers.reduce(
      (prev, e) => {
        if (prev.tag === 'left') return prev;
        if (e.tag === 'left') return e;
        return {
          tag: 'right',
          value: { ...prev.value, ...e.value },
        };
      },
      { tag: 'right', value: {} }
    )
  );
  if (tc.tag === 'left') {
    functions.logger.error(tc.error);
    return;
  }
  await Promise.all(
    Object.entries(tc.value).flatMap(([colName, docs]) =>
      Object.entries(docs).map(([docId, doc]) => {
        const key: DocKey = { col: { type: 'normal', name: colName }, id: docId };
        if (doc.op === 'merge') return db.mergeDoc({ key, docData: doc.data });
        if (doc.op === 'delete') return db.deleteDoc({ key });
        assertNever(doc);
      })
    )
  );
  await Promise.all(action.mayFailOps.map((mfo) => mfo({ ...db, snapshot })));
}

function isTriggerRequired<T extends TriggerType>(
  action: Y<T, Error, admin.firestore.WriteResult>
): boolean {
  return action.getTransactionCommits.length > 0 || action.mayFailOps.length > 0;
}

export function getTriggers({
  firestore,
  cols,
  triggerRegions,
}: {
  readonly firestore: admin.firestore.Firestore;
  readonly version: {
    readonly 'kira-core': '0.3.8';
    readonly 'kira-firebase-server': '0.1.8';
  };
  readonly cols: Dictionary<Dictionary<Field>>;
  readonly triggerRegions?: readonly typeof functions.SUPPORTED_REGIONS[number][];
}): FirebaseTriggerDict {
  const triggers = Object.entries(cols).flatMap(([colName, col]) =>
    Object.entries(col).map(([fieldName, fieldSpec]) =>
      makeTrigger({ colName, fieldName, fieldSpec })
    )
  );

  const db: DB = {
    getDoc: async ({ key }) => {
      const docSnapshot = await getDocRef({ firestore, key })
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
      getDocRef({ firestore, key }).set(writeToFirestoreDocData(docData), { merge: true }),
    deleteDoc: ({ key }) => getDocRef({ firestore, key }).delete(),
  };

  return Object.fromEntries(
    Object.entries(cols).map(([colName]) => {
      const docKey = `${colName}/{docId}`;

      const colTrigger: DocumentBuilder = triggerRegions
        ? functions.region(...triggerRegions).firestore.document(docKey)
        : functions.firestore.document(docKey);

      const onCreate = getTCAndMFO(triggers.map((trigger) => trigger.onCreate?.[colName]));
      const onUpdate = getTCAndMFO(triggers.map((trigger) => trigger.onUpdate?.[colName]));
      const onDelete = getTCAndMFO(triggers.map((trigger) => trigger.onDelete?.[colName]));

      return [
        colName,
        {
          onCreate: isTriggerRequired(onCreate)
            ? colTrigger.onCreate(async (snapshot) => {
                if (await shouldRunTrigger(snapshot)) {
                  await runTrigger({
                    db,
                    action: onCreate,
                    snapshot: {
                      id: snapshot.id,
                      data: firestoreToReadDocData(snapshot.data()),
                    },
                  });
                }
              })
            : undefined,
          onUpdate: isTriggerRequired(onUpdate)
            ? colTrigger.onUpdate(async (snapshot) => {
                if (await shouldRunTrigger(snapshot.after)) {
                  await runTrigger({
                    db,
                    action: onUpdate,
                    snapshot: {
                      id: snapshot.after.id,
                      before: firestoreToReadDocData(snapshot.before.data()),
                      after: firestoreToReadDocData(snapshot.after.data()),
                    },
                  });
                }
              })
            : undefined,
          onDelete: isTriggerRequired(onDelete)
            ? colTrigger.onDelete(async (snapshot) => {
                await runTrigger({
                  db,
                  action: onDelete,
                  snapshot: {
                    id: snapshot.id,
                    data: firestoreToReadDocData(snapshot.data()),
                  },
                });
              })
            : undefined,
        },
      ];
    })
  );
}


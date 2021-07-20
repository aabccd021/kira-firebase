import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { QueryDocumentSnapshot } from 'firebase-functions/lib/providers/firestore';
import { DB, Dictionary, DocKey } from 'kira-nosql';

export type FirebaseTriggerDict = Dictionary<{
  readonly onCreate?: functions.CloudFunction<QueryDocumentSnapshot>;
  readonly onUpdate?: functions.CloudFunction<functions.Change<QueryDocumentSnapshot>>;
  readonly onDelete?: functions.CloudFunction<QueryDocumentSnapshot>;
}>;

export type FirestoreField =
  | number
  | string
  | admin.firestore.Timestamp
  | readonly string[]
  | FirestoreImageField;

export type FirestoreImageField = {
  readonly url: string;
};

export type FirestoreReadDocData = Dictionary<
  ({ readonly id: string } & FirestoreReadDocData) | FirestoreField
>;

export type FirestoreUpdateField = FirestoreField | admin.firestore.FieldValue | Date;

export type FirestoreUpdateDocData = Dictionary<FirestoreUpdateField>;

export type FirestoreSetField = FirestoreSetDocData | FirestoreUpdateField;

export type FirestoreSetDocData = Dictionary<FirestoreSetField>;

export type FirestoreFieldValue = typeof admin.firestore.FieldValue;

export type TransactionResult = { readonly success: boolean };

export type RunTransaction = (
  updateFunction: (transaction: admin.firestore.Transaction) => Promise<void>
) => Promise<void>;

export type TriggerContext = {
  readonly getDocRef: GetDocRef;
  readonly runTransaction: RunTransaction;
  readonly db: DB;
  readonly firestoreFieldValue: FirestoreFieldValue;
};

export type GetDocRef = (key: DocKey) => admin.firestore.DocumentReference;

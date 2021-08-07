import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { QueryDocumentSnapshot } from 'firebase-functions/lib/providers/firestore';
import { ImageFieldValue } from 'kira-core';
import { Dict } from 'trimop';

export type FirebaseTrigger = Dict<ColFirebaseTrigger | undefined>;

export type ColFirebaseTrigger = {
  readonly onCreate?: functions.CloudFunction<QueryDocumentSnapshot>;
  readonly onUpdate?: functions.CloudFunction<functions.Change<QueryDocumentSnapshot>>;
  readonly onDelete?: functions.CloudFunction<QueryDocumentSnapshot>;
};

export type FirestoreField =
  | number
  | string
  | admin.firestore.Timestamp
  | ImageFieldValue
  | RefFirestoreField;

export type RefFirestoreField = { readonly _id: string } & FirestoreReadDoc;

export type FirestoreReadDoc = Dict<FirestoreField>;

export type FirestoreUpdateField = FirestoreField | admin.firestore.FieldValue | Date;

export type FirestoreUpdateDocData = Dict<FirestoreUpdateField>;

export type FirestoreSetField = FirestoreSetDocData | FirestoreUpdateField;

export type FirestoreSetDocData = Dict<FirestoreSetField>;

export type FirestoreFieldValue = typeof admin.firestore.FieldValue;

export type TransactionResult = { readonly success: boolean };

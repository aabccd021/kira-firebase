import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { QueryDocumentSnapshot } from 'firebase-functions/lib/providers/firestore';
import { Schema } from 'kira-nosql';
import { GetDoc } from 'kira-nosql/lib/type';
import { Dictionary } from 'lodash';

export type DocumentKey = { readonly col: string; readonly id: string };

export type TriggerContext<GDE> = {
  readonly getDoc: GetDoc<GDE>;
};

export type Update = Dictionary<Dictionary<Document>>;

export type DocumentField =
  | number
  | string
  | FirebaseFirestore.FieldValue
  | Dictionary<DocumentField>;
export type Document = Dictionary<DocumentField>;

export type Snapshot = QueryDocumentSnapshot | functions.Change<QueryDocumentSnapshot>;

export type Query<T extends string = string> = {
  readonly col: T;
  readonly limit?: number;
  readonly orderByField?: string;
  readonly orderDirection?: 'asc' | 'desc';
};

export type DBRQuery = (query: Query) => Promise<readonly { readonly id: string }[]>;

export type FirebaseTriggerDict = Dictionary<{
  readonly onCreate?: functions.CloudFunction<QueryDocumentSnapshot>;
  readonly onUpdate?: functions.CloudFunction<functions.Change<QueryDocumentSnapshot>>;
  readonly onDelete?: functions.CloudFunction<QueryDocumentSnapshot>;
}>;

export type GetTriggers<S extends Schema> = (args: {
  readonly firestore: admin.firestore.Firestore;
  readonly schema: S;
  readonly triggerRegions?: readonly typeof functions.SUPPORTED_REGIONS[number][];
}) => FirebaseTriggerDict;

export type FirestorePrimitiveField =
  | number
  | string
  | admin.firestore.Timestamp
  | readonly string[];

export type FirestoreReadDocData = {
  readonly [key: string]:
    | ({ readonly id: string } & FirestoreReadDocData)
    | FirestorePrimitiveField;
};

export type FirestoreWriteField =
  | FirestoreWriteDocData
  | FirestorePrimitiveField
  | admin.firestore.FieldValue
  | Date;

export type FirestoreWriteDocData = { readonly [key: string]: FirestoreWriteField };

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { QueryDocumentSnapshot } from 'firebase-functions/lib/providers/firestore';
import { ImageFieldValue } from 'kira-core';
import { Dict } from 'trimop';

export type ColFirebaseTrigger = {
  readonly onCreate?: functions.CloudFunction<QueryDocumentSnapshot>;
  readonly onDelete?: functions.CloudFunction<QueryDocumentSnapshot>;
  readonly onUpdate?: functions.CloudFunction<functions.Change<QueryDocumentSnapshot>>;
};

export type FirebaseTrigger = Dict<ColFirebaseTrigger | undefined>;

export const ID_FIELD = '_id' as const;

// eslint-disable-next-line no-use-before-define
export type RefFirestoreField = { readonly [ID_FIELD]: string } & FirestoreDoc;

export type FirestoreField =
  | number
  | string
  | admin.firestore.Timestamp
  | ImageFieldValue
  | RefFirestoreField;

export type FirestoreDoc = Dict<FirestoreField>;

export type FirestoreUpdateField = FirestoreField | admin.firestore.FieldValue | Date;

export type FirestoreUpdateDoc = Dict<FirestoreUpdateField>;

// eslint-disable-next-line no-use-before-define
export type FirestoreSetField = FirestoreSetDoc | FirestoreUpdateField;

export type FirestoreSetDoc = Dict<FirestoreSetField>;

export type FirestoreFieldValue = typeof admin.firestore.FieldValue;

export type TransactionResult = { readonly success: boolean };

export type FirestoreToDocError = {
  readonly doc: FirestoreDoc;
  readonly field: never;
  readonly fieldName: string;
};

/**
 *
 */
export type FirebaseGetDocError = {
  readonly _errorType: 'GetDocError';
  readonly _getDocErrorType: 'FirebaseGetDoc';
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
  readonly _errorType: 'UpdateDocError';
  readonly _updateDocErrorType: 'FirebaseUpdateDoc';
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
  readonly _errorType: 'GetDocError';
  readonly _getDocErrorType: 'FirestoreToDocGetDoc';
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
    _deleteDocErrorType: 'FirebaseDeleteDoc',
    _errorType: 'DeleteDocError',
  };
}

/**
 *
 */
export type Migration = () => Promise<void>;

import { firestore } from 'firebase-admin';
import {
  DateField,
  Doc,
  ImageField,
  isImageFieldValue,
  NumberField,
  RefField,
  StringField,
} from 'kira-core';
import {
  Either,
  eitherArrayReduce,
  eitherMapRight,
  isStringArray,
  Left,
  Option,
  optionFold,
  Right,
  Some,
} from 'trimop';

import { FROM_CLIENT_FLAG } from './should-run-trigger';
import {
  FirestoreDoc,
  FirestoreField,
  FirestoreToDocError,
  ID_FIELD,
  RefFirestoreField,
} from './type';

/**
 *
 * @param field
 * @returns
 */
function isRefFirestoreField(field: FirestoreField): field is RefFirestoreField {
  return (
    typeof (field as RefFirestoreField)[ID_FIELD] === 'string' &&
    Object.entries(field).every(
      ([, fieldValue]) =>
        typeof fieldValue === 'string' ||
        typeof fieldValue === 'number' ||
        fieldValue instanceof firestore.Timestamp ||
        isStringArray(fieldValue) ||
        isImageFieldValue(fieldValue) ||
        isRefFirestoreField(field)
    )
  );
}

/**
 * FirestoreToDocError
 */

/**
 *
 * @param doc
 * @returns
 */
export function firestoreToDoc(doc: Option<FirestoreDoc>): Either<FirestoreToDocError, Doc> {
  return optionFold(
    doc,
    () => Right({}),
    (doc) =>
      eitherArrayReduce(
        Object.entries(doc).filter(([fieldName]) => fieldName !== FROM_CLIENT_FLAG),
        Right({}),
        (acc, [fieldName, field]) => {
          if (typeof field === 'string') {
            return Right({
              ...acc,
              [fieldName]: StringField(field),
            });
          }
          if (typeof field === 'number') {
            return Right({
              ...acc,
              [fieldName]: NumberField(field),
            });
          }
          if (field instanceof firestore.Timestamp) {
            return Right({
              ...acc,
              [fieldName]: DateField(field.toDate()),
            });
          }
          if (isImageFieldValue(field)) {
            return Right({
              ...acc,
              [fieldName]: ImageField(field),
            });
          }
          if (isRefFirestoreField(field)) {
            return eitherMapRight(firestoreToDoc(Some(field)), (doc) =>
              Right({
                ...acc,
                [fieldName]: RefField({ doc, id: field[ID_FIELD] }),
              })
            );
          }
          return Left({ doc, field, fieldName });
        }
      )
  );
}

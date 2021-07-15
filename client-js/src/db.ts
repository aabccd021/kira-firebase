import assertNever from 'assert-never';
import {
  collection,
  doc,
  FirebaseFirestore,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  QueryConstraint,
  QueryDocumentSnapshot,
  setDoc,
  startAfter,
  Timestamp,
} from 'firebase/firestore/lite';
import {
  DbpGetNewDocId,
  DbpQuery,
  DbpQueryResult,
  DbpReadDoc,
  DbpReadResult,
  DbpSetDoc,
  Dictionary,
  DocData,
  DocKey,
  DocReferenceField,
  Either,
  isNotNil,
  mapValues,
  OCRDocData,
  pickBy,
} from 'kira-client';

export function docKeyToPath(key: DocKey): string {
  return `${key.collection}/${key.id}`;
}

type FirestoreData = Dictionary<FirestoreField>;
type FirestoreField = number | { readonly url: string } | Timestamp | FirestoreRefField | string;
type FirestoreRefField = { readonly id: string } & { readonly [key: string]: FirestoreField };

function firestoreToDocData(firestoreData: FirestoreData): DocData {
  return mapValues(firestoreData, (fieldValue) => {
    if (typeof fieldValue === 'string' || typeof fieldValue === 'number') {
      return fieldValue;
    }
    if (fieldValue instanceof Timestamp) {
      return fieldValue.toDate();
    }
    if (typeof fieldValue === 'object') {
      return firestoreToDocData(fieldValue) as DocReferenceField;
    }
    assertNever(fieldValue);
  });
}

export function ocrToFirestoreDocData(ocrDocData: OCRDocData): FirestoreData {
  return pickBy(
    mapValues(ocrDocData, (field) => {
      if (field.type === 'count') return undefined;
      if (field.type === 'creationTime') return undefined;
      if (field.type === 'image') return field.value;
      if (field.type === 'owner') return { id: field.value.id };
      if (field.type === 'ref') return { id: field.value.id };
      if (field.type === 'string') return field.value;
      assertNever(field);
    }),
    isNotNil
  );
}

// TODO: give some real errors
export type DBError = Error;
export type DBCursor = QueryDocumentSnapshot<unknown>;

export function makeDbpReadDoc(firestore: FirebaseFirestore): DbpReadDoc<DBError> {
  return async (key) =>
    getDoc(doc(firestore, docKeyToPath(key)))
      .then<Either<DbpReadResult, DBError>>((snapshot) => {
        if (!snapshot.exists()) {
          return {
            _tag: 'right',
            value: { state: 'notExists' },
          };
        }

        return {
          _tag: 'right',
          value: { state: 'exists', data: firestoreToDocData(snapshot.data()) },
        };
      })
      .catch((error) => ({ _tag: 'left', error }));
}

export function makeDbpSetDoc(firestore: FirebaseFirestore): DbpSetDoc<DBError> {
  return async (key, ocrDocData) =>
    setDoc(
      doc(firestore, docKeyToPath(key)),
      {
        ...ocrToFirestoreDocData(ocrDocData),
        _fromClient: true,
      },
      {
        merge: true,
      }
    )
      .then<Either<undefined, DBError>>((_) => ({
        _tag: 'right',
        value: undefined,
      }))
      .then((error) => error);
}

export function makeDbpGetNewDocId(firestore: FirebaseFirestore): DbpGetNewDocId<DBError> {
  return async ({ colName: col }) => {
    const { id } = doc(collection(firestore, col));
    return { _tag: 'right', value: id };
  };
}

export function makeDbpQuery(firestore: FirebaseFirestore): DbpQuery<DBCursor, DBError> {
  return async (queryDef, cursor) => {
    const queryConstraints: readonly QueryConstraint[] = [
      queryDef.limit ? limit(queryDef.limit) : undefined,
      queryDef.orderByField ? orderBy(queryDef.orderByField, queryDef.orderDirection) : undefined,
      cursor ? startAfter(cursor) : undefined,
    ].filter(isDefined);
    return getDocs(query(collection(firestore, queryDef.collection), ...queryConstraints))
      .then<Either<DbpQueryResult<DBCursor>, DBError>>((queryResult) => ({
        _tag: 'right',
        value: {
          docs: queryResult.docs.map((snapshot) => ({
            key: {
              collection: queryDef.collection,
              id: snapshot.id,
            },
            data: firestoreToDocData(snapshot.data() as FirestoreData),
          })),
          cursor: queryResult.docs[queryResult.docs.length - 1],
        },
      }))
      .catch((error) => ({ _tag: 'left', error }));
  };
}

export function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

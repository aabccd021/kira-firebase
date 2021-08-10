import { RefUpdateField, WriteDoc, WriteField } from 'kira-core';

import { FirestoreFieldValue, FirestoreUpdateDoc, FirestoreUpdateField } from './type';

function writeToFirestoreUpdateField({
  field,
  firestoreFieldValue,
}: {
  readonly field: Exclude<WriteField, RefUpdateField>;
  readonly firestoreFieldValue: FirestoreFieldValue;
}): FirestoreUpdateField {
  if (
    field._type === 'Number' ||
    field._type === 'String' ||
    field._type === 'Date' ||
    field._type === 'Image'
  ) {
    return field.value;
  }
  if (field._type === 'Increment') {
    return firestoreFieldValue.increment(field.value);
  }
  // if (field._type === 'CreationTime')
  return firestoreFieldValue.serverTimestamp();
}

// function writeToFirestoreSetField({
//   field,
//   firestoreFieldValue,
// }: {
//   readonly field: WriteField;
//   readonly firestoreFieldValue: FirestoreFieldValue;
// }): FirestoreSetField {
//   if (field._type === 'RefUpdate') {
//     // eslint-disable-next-line no-use-before-define
//     return writeToFirestoreSetDocData({ firestoreFieldValue, writeDoc: field.doc });
//   }
//   return writeToFirestoreUpdateField({ field, firestoreFieldValue });
// }

// export function writeToFirestoreSetDocData({
//   writeDoc,
//   firestoreFieldValue,
// }: {
//   readonly firestoreFieldValue: FirestoreFieldValue;
//   readonly writeDoc: WriteDoc;
// }): FirestoreSetDoc {
//   return Object.fromEntries(
//     Object.entries(writeDoc).map<readonly [string, FirestoreSetField]>(([fieldName, field]) => [
//       fieldName,
//       writeToFirestoreSetField({ field, firestoreFieldValue }),
//     ])
//   );
// }

export function writeToFirestoreUpdateDocData({
  writeDoc,
  firestoreFieldValue,
}: {
  readonly firestoreFieldValue: FirestoreFieldValue;
  readonly writeDoc: WriteDoc;
}): FirestoreUpdateDoc {
  return Object.entries(writeDoc).reduce<FirestoreUpdateDoc>((prev, [fieldName, field]) => {
    if (field._type === 'RefUpdate') {
      return {
        ...prev,
        ...Object.fromEntries(
          Object.entries(
            writeToFirestoreUpdateDocData({ firestoreFieldValue, writeDoc: field.doc })
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

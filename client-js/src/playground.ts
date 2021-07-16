import { initializeApp } from 'firebase/app';
import { doc, getFirestore, useFirestoreEmulator, writeBatch } from 'firebase/firestore/lite';

const firestore = getFirestore(initializeApp({ projectId: 'demo-kira' }));

useFirestoreEmulator(firestore, 'localhost', 8080);

// updateDoc(doc(firestore, docKeyToPath({ collection: 'user', id: 'aabccde' })), {
//   ...ocrToFirestoreDocData({ zz: { type: 'string', value: 'xxx' } }),
//   _fromClient: true,
// });

// setDoc(
//   doc(firestore, docKeyToPath({ collection: 'user', id: 'aabccdu' })),
//   {
//     'a.x': 'bla',
//   },
//   { merge: true }
// );

// updateDoc(doc(firestore, docKeyToPath({ collection: 'user', id: 'aabccdu' })), {
//   'a.b': 'z',
// });

// const dbpSetDoc = makeDbpSetDoc(firestore);

// dbpSetDoc(
//   { collection: 'user', id: 'user1' },
//   {
//     displayName: { type: 'string', value: 'wiw' },
//   }
// );

// eslint-disable-next-line functional/functional-parameters
async function main(): Promise<void> {
  const wb = writeBatch(firestore);
  wb.set(doc(firestore, 'user/ccd'), { a: 'b' });
  await wb.commit();
}

main();

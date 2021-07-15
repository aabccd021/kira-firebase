import { initializeApp } from 'firebase/app';
import {
  doc,
  getFirestore,
  setDoc,
  updateDoc,
  useFirestoreEmulator,
} from 'firebase/firestore/lite';

import { docKeyToPath } from './db';

const firestore = getFirestore(initializeApp({ projectId: 'demo-kira' }));

useFirestoreEmulator(firestore, 'localhost', 8080);

// updateDoc(doc(firestore, docKeyToPath({ collection: 'user', id: 'aabccde' })), {
//   ...ocrToFirestoreDocData({ zz: { type: 'string', value: 'xxx' } }),
//   _fromClient: true,
// });

setDoc(
  doc(firestore, docKeyToPath({ collection: 'user', id: 'aabccdu' })),
  {
    'a.x': 'bla',
  },
  { merge: true }
);

updateDoc(doc(firestore, docKeyToPath({ collection: 'user', id: 'aabccdu' })), {
  'a.b': 'z',
});

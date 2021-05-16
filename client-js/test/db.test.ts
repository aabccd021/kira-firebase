import 'jest-extended';
import 'jest-chain';

import { initializeApp } from 'firebase/app';
import { getFirestore, useFirestoreEmulator } from 'firebase/firestore/lite';

import { makeDbpReadDoc, makeDbpSetDoc } from '../src/db';

const sleep = (milli: number) => new Promise((res) => setTimeout(res, milli));

describe('a', () => {
  const firebaseApp = initializeApp({ projectId: 'demo-kira' });

  useFirestoreEmulator(getFirestore(firebaseApp), 'localhost', 8080);

  const dbpReadDoc = makeDbpReadDoc(getFirestore(firebaseApp));

  const dbpSetDoc = makeDbpSetDoc(getFirestore(firebaseApp));

  it('b', async () => {
    await dbpSetDoc(
      { collection: 'user', id: 'user1' },
      {
        displayName: { type: 'string', value: 'user1' },
        profilePicture: {
          type: 'image',
          value: {
            url: 'https://sakurazaka46.com/images/14/eb2/a748ca8dac608af8edde85b62a5a8/1000_1000_102400.jpg',
          },
        },
      }
    );
    await sleep(5000);

    const user1_0 = await dbpReadDoc({ collection: 'user', id: 'user1' });
    expect(user1_0._tag).toEqual('right');
    expect(user1_0).toEqual({
      _tag: 'right',
      value: {
        data: {
          displayName: 'user1',
          memeImageCreatedCount: 0,
          memeCreatedCount: 0,
          profilePicture: {
            url: 'https://sakurazaka46.com/images/14/eb2/a748ca8dac608af8edde85b62a5a8/1000_1000_102400.jpg',
          },
          joinedTime: expect.toSatisfy(
            (x) =>
              x instanceof Date &&
              new Date().getTime() - x.getTime() < 7000 &&
              new Date().getTime() - x.getTime() > 0
          ),
        },
        state: 'exists',
      },
    });
  }, 20000);
});

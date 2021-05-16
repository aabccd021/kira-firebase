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
    expect(user1_0).toEqual(
      expect.objectContaining({
        _tag: 'right',
        value: expect.objectContaining({
          data: expect.objectContaining({
            displayName: 'user1',
            memeImageCreatedCount: 0,
            memeCreatedCount: 0,
            profilePicture: {
              url: 'https://sakurazaka46.com/images/14/eb2/a748ca8dac608af8edde85b62a5a8/1000_1000_102400.jpg',
            },
          }),
          state: 'exists',
        }),
      })
    );
    // const user1JoinedTime = user1_0?.['joinedTime'] as firestore.Timestamp;
    // const timeSinceUser1Joined = new Date().getTime() - user1JoinedTime.toDate().getTime();
    // expect(timeSinceUser1Joined).toBeGreaterThan(0);
    // expect(timeSinceUser1Joined).toBeLessThan(7000);
  }, 20000);
});

import 'jest-extended';
import 'jest-chain';

import { initializeApp } from 'firebase/app';
import { getFirestore, useFirestoreEmulator } from 'firebase/firestore/lite';

import { makeDbpReadDoc, makeDbpSetDoc } from '../src/db';

const sleep = (milli: number) => new Promise((res) => setTimeout(res, milli));

describe('js client', () => {
  const firebaseApp = initializeApp({ projectId: 'demo-kira' });

  useFirestoreEmulator(getFirestore(firebaseApp), 'localhost', 8080);

  const dbpReadDoc = makeDbpReadDoc(getFirestore(firebaseApp));
  const dbpSetDoc = makeDbpSetDoc(getFirestore(firebaseApp));

  it('can handle scenario 1', async () => {
    // create user1
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

    // expect trigger working on user1
    const user1_0 = await dbpReadDoc({ collection: 'user', id: 'user1' });
    expect(user1_0._tag).toStrictEqual('right');
    expect(user1_0).toStrictEqual({
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

    // user1 creates image1
    await dbpSetDoc(
      { collection: 'memeImage', id: 'image1' },
      {
        image: {
          type: 'image',
          value: { url: 'https://i.ytimg.com/vi/abuAVZ6LpzM/hqdefault.jpg' },
        },
        owner: {
          type: 'owner',
          value: { id: 'user1', user: {} },
        },
      }
    );
    await sleep(5000);

    // expect trigger working on image1
    const image1_0 = await dbpReadDoc({ collection: 'memeImage', id: 'image1' });
    expect(image1_0).toStrictEqual({
      _tag: 'right',
      value: {
        state: 'exists',
        data: {
          creationTime: expect.toSatisfy(
            (x) =>
              x instanceof Date &&
              new Date().getTime() - x.getTime() < 7000 &&
              new Date().getTime() - x.getTime() > 0
          ),
          image: { url: 'https://i.ytimg.com/vi/abuAVZ6LpzM/hqdefault.jpg' },
          memeCreatedCount: 0,
          owner: {
            id: 'user1',
            displayName: 'user1',
            profilePicture: {
              url: 'https://sakurazaka46.com/images/14/eb2/a748ca8dac608af8edde85b62a5a8/1000_1000_102400.jpg',
            },
          },
        },
      },
    });

    // expect trigger working on user1
    const user1_1 = await dbpReadDoc({ collection: 'user', id: 'user1' });
    expect(user1_1).toStrictEqual({
      _tag: 'right',
      value: {
        state: 'exists',
        data: {
          joinedTime: expect.toSatisfy(
            (x) =>
              x instanceof Date &&
              new Date().getTime() - x.getTime() < 12000 &&
              new Date().getTime() - x.getTime() > 5000
          ),
          displayName: 'user1',
          memeImageCreatedCount: 1,
          memeCreatedCount: 0,
          profilePicture: {
            url: 'https://sakurazaka46.com/images/14/eb2/a748ca8dac608af8edde85b62a5a8/1000_1000_102400.jpg',
          },
        },
      },
    });

    // user1 creates meme1
    await dbpSetDoc(
      { collection: 'meme', id: 'meme1' },
      {
        memeImage: {
          type: 'ref',
          refCol: 'image',
          value: { id: 'image1', doc: {} },
        },
        text: { type: 'string', value: 'L eats banana' },
        owner: {
          type: 'owner',
          value: { id: 'user1', user: {} },
        },
      }
    );
    await sleep(5000);

    // expect triggers work on meme1
    const meme1 = await dbpReadDoc({ collection: 'meme', id: 'meme1' });
    expect(meme1).toStrictEqual({
      _tag: 'right',
      value: {
        state: 'exists',
        data: {
          creationTime: expect.toSatisfy(
            (x) =>
              x instanceof Date &&
              new Date().getTime() - x.getTime() < 7000 &&
              new Date().getTime() - x.getTime() > 0
          ),
          text: 'L eats banana',
          owner: {
            id: 'user1',
            displayName: 'user1',
            profilePicture: {
              url: 'https://sakurazaka46.com/images/14/eb2/a748ca8dac608af8edde85b62a5a8/1000_1000_102400.jpg',
            },
          },
          memeImage: {
            id: 'image1',
            image: { url: 'https://i.ytimg.com/vi/abuAVZ6LpzM/hqdefault.jpg' },
          },
        },
      },
    });

    // expect triggers work on image1
    const image1_1 = await dbpReadDoc({ collection: 'memeImage', id: 'image1' });
    expect(image1_1).toStrictEqual({
      _tag: 'right',
      value: {
        state: 'exists',
        data: {
          creationTime: expect.toSatisfy(
            (x) =>
              x instanceof Date &&
              new Date().getTime() - x.getTime() < 12000 &&
              new Date().getTime() - x.getTime() > 5000
          ),
          image: { url: 'https://i.ytimg.com/vi/abuAVZ6LpzM/hqdefault.jpg' },
          memeCreatedCount: 1,
          owner: {
            id: 'user1',
            displayName: 'user1',
            profilePicture: {
              url: 'https://sakurazaka46.com/images/14/eb2/a748ca8dac608af8edde85b62a5a8/1000_1000_102400.jpg',
            },
          },
        },
      },
    });

    // expect triggers work on user1
    const user1_2 = await dbpReadDoc({ collection: 'user', id: 'user1' });
    expect(user1_2).toStrictEqual({
      _tag: 'right',
      value: {
        state: 'exists',
        data: {
          joinedTime: expect.toSatisfy(
            (x) =>
              x instanceof Date &&
              new Date().getTime() - x.getTime() < 17000 &&
              new Date().getTime() - x.getTime() > 10000
          ),
          displayName: 'user1',
          memeImageCreatedCount: 1,
          memeCreatedCount: 1,
          profilePicture: {
            url: 'https://sakurazaka46.com/images/14/eb2/a748ca8dac608af8edde85b62a5a8/1000_1000_102400.jpg',
          },
        },
      },
    });
  }, 20000);
});

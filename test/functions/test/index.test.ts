import { firestore } from 'firebase-admin';
import { clearDb, getApp } from '../src/db';

const sleep = (milli: number) => new Promise((res) => setTimeout(res, milli));
const db = getApp().firestore();

describe('Functions', () => {
  beforeEach(async () => {
    await clearDb();
  });

  test('can add doc', async function () {
    const postCount0 = (await db.collection('posts').get()).docs.length;
    expect(postCount0).toBe(0);
    expect(postCount0).not.toBe(1);

    await db.collection('posts').add({ title: 'New Posta' });
    await sleep(1000);

    const posts = await db.collection('posts').get();
    const postCount1 = posts.docs.length;
    expect(postCount1).toBe(1);
    expect(postCount1).not.toBe(0);
    expect(posts.docs[0].data()).toStrictEqual({ title: 'New Posta' });

    await db.collection('posts').add({ title: 'New Post' });
    await sleep(1000);

    const postCount2 = (await db.collection('posts').get()).docs.length;
    expect(postCount2).toBe(2);
    expect(postCount2).not.toBe(1);
  });

  test('can clearDb', async function () {
    const db = getApp().firestore();

    const postCount = (await db.collection('posts').get()).docs.length;
    expect(postCount).toBe(0);
    expect(postCount).not.toBe(1);
    expect(postCount).not.toBe(2);
  });

  test('kira can handle scenario 1', async function () {
    /**
     * createUser1
     */
    await db.doc('user/user1').set({
      displayName: 'user1',
      profilePicture: {
        url:
          'https://sakurazaka46.com/images/14/eb2/a748ca8dac608af8edde85b62a5a8/1000_1000_102400.jpg',
      },
    });
    await sleep(5000);

    // expect trigger working on user1
    const user1_0 = (await db.doc('user/user1').get()).data();
    expect(user1_0).toEqual(
      expect.objectContaining({
        displayName: 'user1',
        memeImageCreatedCount: 0,
        memeCreatedCount: 0,
        profilePicture: {
          url:
            'https://sakurazaka46.com/images/14/eb2/a748ca8dac608af8edde85b62a5a8/1000_1000_102400.jpg',
        },
      })
    );
    const user1JoinedTime = user1_0?.['joinedTime'] as firestore.Timestamp;
    const timeSinceUser1Joined = new Date().getTime() - user1JoinedTime.toDate().getTime();
    expect(timeSinceUser1Joined).toBeGreaterThan(0);
    expect(timeSinceUser1Joined).toBeLessThan(7000);

    /**
     * user1 creates image1
     */
    await db.doc('memeImage/image1').set({
      image: { url: 'https://i.ytimg.com/vi/abuAVZ6LpzM/hqdefault.jpg' },
      owner: { id: 'user1' },
    });
    await sleep(5000);

    // expect trigger working on image1
    const image1_0 = (await db.doc('memeImage/image1').get()).data();
    expect(image1_0).toEqual(
      expect.objectContaining({
        image: { url: 'https://i.ytimg.com/vi/abuAVZ6LpzM/hqdefault.jpg' },
        memeCreatedCount: 0,
        owner: {
          id: 'user1',
          displayName: 'user1',
          profilePicture: {
            url:
              'https://sakurazaka46.com/images/14/eb2/a748ca8dac608af8edde85b62a5a8/1000_1000_102400.jpg',
          },
        },
      })
    );
    const image1CreationTime = image1_0?.['creationTime'] as firestore.Timestamp;
    const timeSinceImage1Creation = new Date().getTime() - image1CreationTime.toDate().getTime();
    expect(timeSinceImage1Creation).toBeGreaterThan(0);
    expect(timeSinceImage1Creation).toBeLessThan(7000);

    // expect trigger working on user1
    const user1_1 = (await db.doc('user/user1').get()).data();
    expect(user1_1).toEqual(
      expect.objectContaining({
        displayName: 'user1',
        memeImageCreatedCount: 1,
        memeCreatedCount: 0,
        profilePicture: {
          url:
            'https://sakurazaka46.com/images/14/eb2/a748ca8dac608af8edde85b62a5a8/1000_1000_102400.jpg',
        },
      })
    );
    expect((user1_1?.['joinedTime'] as firestore.Timestamp).isEqual(user1JoinedTime)).toBe(true);

    /**
     * user1 creates meme1
     */
    await db.doc('meme/meme1').set({
      memeImage: { id: 'image1' },
      text: 'L eats banana',
      owner: { id: 'user1' },
    });
    await sleep(5000);

    // expect triggers work on meme1
    const meme1 = (await db.doc('meme/meme1').get()).data();
    expect(meme1).toEqual(
      expect.objectContaining({
        text: 'L eats banana',
        owner: {
          id: 'user1',
          displayName: 'user1',
          profilePicture: {
            url:
              'https://sakurazaka46.com/images/14/eb2/a748ca8dac608af8edde85b62a5a8/1000_1000_102400.jpg',
          },
        },
        memeImage: {
          id: 'image1',
          image: { url: 'https://i.ytimg.com/vi/abuAVZ6LpzM/hqdefault.jpg' },
        },
      })
    );
    const timeSinceCreatedMeme1 =
      new Date().getTime() - (meme1?.['creationTime'] as firestore.Timestamp).toDate().getTime();
    expect(timeSinceCreatedMeme1).toBeGreaterThan(0);
    expect(timeSinceCreatedMeme1).toBeLessThan(7000);

    // expect triggers work on image1
    const image1_1 = (await db.doc('memeImage/image1').get()).data();
    expect(image1_1).toEqual(
      expect.objectContaining({
        image: { url: 'https://i.ytimg.com/vi/abuAVZ6LpzM/hqdefault.jpg' },
        memeCreatedCount: 1,
        owner: {
          id: 'user1',
          displayName: 'user1',
          profilePicture: {
            url:
              'https://sakurazaka46.com/images/14/eb2/a748ca8dac608af8edde85b62a5a8/1000_1000_102400.jpg',
          },
        },
      })
    );
    expect((image1_1?.['creationTime'] as firestore.Timestamp).isEqual(image1CreationTime)).toBe(
      true
    );

    // expect triggers work on user1
    const user1_2 = (await db.doc('user/user1').get()).data();
    expect(user1_2).toEqual(
      expect.objectContaining({
        displayName: 'user1',
        memeImageCreatedCount: 1,
        memeCreatedCount: 1,
        profilePicture: {
          url:
            'https://sakurazaka46.com/images/14/eb2/a748ca8dac608af8edde85b62a5a8/1000_1000_102400.jpg',
        },
      })
    );
    expect((user1_2?.['joinedTime'] as firestore.Timestamp).isEqual(user1JoinedTime)).toBe(true);
  }, 20000);
});

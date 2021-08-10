import * as admin from 'firebase-admin';
import { makeCountDraft, makeCreationTimeDraft, makeRefDraft } from 'kira-nosql';
import { None } from 'trimop';

import { getFirebaseTriggers } from '../src';
import { almostEqualTimeWith, createDoc, getDoc, setMergeDoc, sleep, test } from './util';

describe('getFirebaseTriggers', () => {
  afterAll(test.cleanup);

  const triggers = getFirebaseTriggers({
    buildDraft: ({ spec, context }) => {
      if (spec._type === 'Count') {
        return makeCountDraft({ context, spec });
      }
      if (spec._type === 'Ref') {
        return makeRefDraft({ context, spec });
      }
      if (spec._type === 'CreationTime') {
        return makeCreationTimeDraft({ context, spec });
      }
      return {
        onCreate: None(),
        onDelete: None(),
        onUpdate: None(),
      };
    },
    firestore: admin.firestore(),
    firestoreFieldValue: admin.firestore.FieldValue,
    spec: {
      meme: {
        creationTime: {
          _type: 'CreationTime',
        },
        memeImage: {
          _type: 'Ref',
          isOwner: false,
          refedCol: 'memeImage',
          syncedFields: {
            image: true,
          },
          thisColRefers: [],
        },
        owner: {
          _type: 'Ref',
          isOwner: true,
          refedCol: 'user',
          syncedFields: {
            displayName: true,
            profilePicture: true,
          },
          thisColRefers: [],
        },
        text: {
          _type: 'String',
        },
      },
      memeImage: {
        creationTime: {
          _type: 'CreationTime',
        },
        image: {
          _type: 'Image',
        },
        memeCreatedCount: {
          _type: 'Count',
          countedCol: 'meme',
          groupByRef: 'memeImage',
        },
        owner: {
          _type: 'Ref',
          isOwner: true,
          refedCol: 'user',
          syncedFields: {
            displayName: true,
            profilePicture: true,
          },
          thisColRefers: [
            {
              colName: 'meme',
              fields: [{ name: 'meme', syncedFields: {} }],
              thisColRefers: [],
            },
          ],
        },
      },
      user: {
        displayName: {
          _type: 'String',
        },
        joinedTime: {
          _type: 'CreationTime',
        },
        memeCreatedCount: {
          _type: 'Count',
          countedCol: 'meme',
          groupByRef: 'owner',
        },
        memeImageCreatedCount: {
          _type: 'Count',
          countedCol: 'memeImage',
          groupByRef: 'owner',
        },
        profilePicture: {
          _type: 'Image',
        },
      },
    },
  });

  const userTrigger = triggers['user'];
  const memeImageTrigger = triggers['memeImage'];
  const memeTrigger = triggers['meme'];

  const user1Key = { col: 'user', id: 'user1' };
  const memeImage1key = { col: 'memeImage', id: 'memeImage1' };
  const meme1key = { col: 'meme', id: 'meme1' };

  let user1creationTime: number | undefined;
  let meme1creationTime: number | undefined;
  let memeImage1creationTime: number | undefined;

  describe('on create', () => {
    it('user trigger exists', () => {
      expect(userTrigger?.onCreate).toBeDefined();
    });

    it('memeImage trigger exists', () => {
      expect(memeImageTrigger?.onCreate).toBeDefined();
    });

    it('meme trigger exists', () => {
      expect(memeTrigger?.onCreate).toBeDefined();
    });

    user1creationTime = new Date().getTime();
    it('can create user1', async () => {
      await createDoc(
        user1Key,
        {
          _fromClient: true,
          displayName: 'user1',
          profilePicture: {
            url: 'https://sakurazaka46.com/images/14/eb2/a748ca8dac608af8edde85b62a5a8/1000_1000_102400.jpg',
          },
        },
        userTrigger?.onCreate
      );

      expect(await getDoc(user1Key)).toStrictEqual({
        displayName: 'user1',
        joinedTime: expect.toSatisfy(almostEqualTimeWith(user1creationTime)),
        memeCreatedCount: 0,
        memeImageCreatedCount: 0,
        profilePicture: {
          url: 'https://sakurazaka46.com/images/14/eb2/a748ca8dac608af8edde85b62a5a8/1000_1000_102400.jpg',
        },
      });
    });

    memeImage1creationTime = new Date().getTime();
    it('user1 can create memeImage1', async () => {
      await createDoc(
        memeImage1key,
        {
          _fromClient: true,
          image: { url: 'https://i.ytimg.com/vi/abuAVZ6LpzM/hqdefault.jpg' },
          owner: { _id: 'user1' },
        },
        memeImageTrigger?.onCreate
      );

      expect(await getDoc(memeImage1key)).toStrictEqual({
        creationTime: expect.toSatisfy(almostEqualTimeWith(memeImage1creationTime)),
        image: { url: 'https://i.ytimg.com/vi/abuAVZ6LpzM/hqdefault.jpg' },
        memeCreatedCount: 0,
        owner: {
          _id: 'user1',
          displayName: 'user1',
          profilePicture: {
            url: 'https://sakurazaka46.com/images/14/eb2/a748ca8dac608af8edde85b62a5a8/1000_1000_102400.jpg',
          },
        },
      });

      expect(await getDoc(user1Key)).toStrictEqual({
        displayName: 'user1',
        joinedTime: expect.toSatisfy(almostEqualTimeWith(user1creationTime)),
        memeCreatedCount: 0,
        memeImageCreatedCount: 1,
        profilePicture: {
          url: 'https://sakurazaka46.com/images/14/eb2/a748ca8dac608af8edde85b62a5a8/1000_1000_102400.jpg',
        },
      });
    });

    meme1creationTime = new Date().getTime();
    it('user1 can create meme1', async () => {
      await createDoc(
        meme1key,
        {
          _fromClient: true,
          memeImage: { _id: 'memeImage1' },
          owner: { _id: 'user1' },
          text: 'L eats banana',
        },
        memeTrigger?.onCreate
      );

      expect(await getDoc(meme1key)).toStrictEqual({
        creationTime: expect.toSatisfy(almostEqualTimeWith(meme1creationTime)),
        memeImage: {
          _id: 'memeImage1',
          image: { url: 'https://i.ytimg.com/vi/abuAVZ6LpzM/hqdefault.jpg' },
        },
        owner: {
          _id: 'user1',
          displayName: 'user1',
          profilePicture: {
            url: 'https://sakurazaka46.com/images/14/eb2/a748ca8dac608af8edde85b62a5a8/1000_1000_102400.jpg',
          },
        },
        text: 'L eats banana',
      });

      expect(await getDoc(memeImage1key)).toStrictEqual({
        creationTime: expect.toSatisfy(almostEqualTimeWith(memeImage1creationTime)),
        image: { url: 'https://i.ytimg.com/vi/abuAVZ6LpzM/hqdefault.jpg' },
        memeCreatedCount: 1,
        owner: {
          _id: 'user1',
          displayName: 'user1',
          profilePicture: {
            url: 'https://sakurazaka46.com/images/14/eb2/a748ca8dac608af8edde85b62a5a8/1000_1000_102400.jpg',
          },
        },
      });

      expect(await getDoc(user1Key)).toStrictEqual({
        displayName: 'user1',
        joinedTime: expect.toSatisfy(almostEqualTimeWith(user1creationTime)),
        memeCreatedCount: 1,
        memeImageCreatedCount: 1,
        profilePicture: {
          url: 'https://sakurazaka46.com/images/14/eb2/a748ca8dac608af8edde85b62a5a8/1000_1000_102400.jpg',
        },
      });
    });
  });

  describe('on update', () => {
    it('user trigger exists', () => {
      expect(userTrigger?.onUpdate).toBeDefined();
    });

    it('memeImage trigger exists', () => {
      expect(memeImageTrigger?.onUpdate).toBeDefined();
    });

    it('meme trigger exists', () => {
      expect(memeTrigger?.onUpdate).toBeUndefined();
    });

    it('user1 can updates his display name', async () => {
      await setMergeDoc(
        user1Key,
        {
          _fromClient: true,
          displayName: 'kira masumoto',
        },
        userTrigger?.onUpdate
      );
      await sleep(5000);

      expect(await getDoc(meme1key)).toStrictEqual({
        creationTime: expect.toSatisfy(almostEqualTimeWith(meme1creationTime)),
        memeImage: {
          _id: 'memeImage1',
          image: { url: 'https://i.ytimg.com/vi/abuAVZ6LpzM/hqdefault.jpg' },
        },
        owner: {
          _id: 'user1',
          displayName: 'kira masumoto',
          profilePicture: {
            url: 'https://sakurazaka46.com/images/14/eb2/a748ca8dac608af8edde85b62a5a8/1000_1000_102400.jpg',
          },
        },
        text: 'L eats banana',
      });

      expect(await getDoc(memeImage1key)).toStrictEqual({
        creationTime: expect.toSatisfy(almostEqualTimeWith(memeImage1creationTime)),
        image: { url: 'https://i.ytimg.com/vi/abuAVZ6LpzM/hqdefault.jpg' },
        memeCreatedCount: 1,
        owner: {
          _id: 'user1',
          displayName: 'kira masumoto',
          profilePicture: {
            url: 'https://sakurazaka46.com/images/14/eb2/a748ca8dac608af8edde85b62a5a8/1000_1000_102400.jpg',
          },
        },
      });

      expect(await getDoc(user1Key)).toStrictEqual({
        displayName: 'kira masumoto',
        joinedTime: expect.toSatisfy(almostEqualTimeWith(user1creationTime)),
        memeCreatedCount: 1,
        memeImageCreatedCount: 1,
        profilePicture: {
          url: 'https://sakurazaka46.com/images/14/eb2/a748ca8dac608af8edde85b62a5a8/1000_1000_102400.jpg',
        },
      });
    }, 10000);

    it('can update memeImage1 url', async () => {
      await setMergeDoc(
        memeImage1key,
        {
          _fromClient: true,
          image: {
            url: 'https://sakurazaka46.com/images/14/018/c4e6c7ada458d9bdd8eefeee7acaf-01.jpg',
          },
        },
        memeImageTrigger?.onUpdate
      );
      await sleep(5000);

      expect(await getDoc(meme1key)).toStrictEqual({
        creationTime: expect.toSatisfy(almostEqualTimeWith(meme1creationTime)),
        memeImage: {
          _id: 'memeImage1',
          image: {
            url: 'https://sakurazaka46.com/images/14/018/c4e6c7ada458d9bdd8eefeee7acaf-01.jpg',
          },
        },
        owner: {
          _id: 'user1',
          displayName: 'kira masumoto',
          profilePicture: {
            url: 'https://sakurazaka46.com/images/14/eb2/a748ca8dac608af8edde85b62a5a8/1000_1000_102400.jpg',
          },
        },
        text: 'L eats banana',
      });

      expect(await getDoc(memeImage1key)).toStrictEqual({
        creationTime: expect.toSatisfy(almostEqualTimeWith(memeImage1creationTime)),
        image: {
          url: 'https://sakurazaka46.com/images/14/018/c4e6c7ada458d9bdd8eefeee7acaf-01.jpg',
        },
        memeCreatedCount: 1,
        owner: {
          _id: 'user1',
          displayName: 'kira masumoto',
          profilePicture: {
            url: 'https://sakurazaka46.com/images/14/eb2/a748ca8dac608af8edde85b62a5a8/1000_1000_102400.jpg',
          },
        },
      });

      expect(await getDoc(user1Key)).toStrictEqual({
        displayName: 'kira masumoto',
        joinedTime: expect.toSatisfy(almostEqualTimeWith(user1creationTime)),
        memeCreatedCount: 1,
        memeImageCreatedCount: 1,
        profilePicture: {
          url: 'https://sakurazaka46.com/images/14/eb2/a748ca8dac608af8edde85b62a5a8/1000_1000_102400.jpg',
        },
      });
    }, 10000);
  });
});

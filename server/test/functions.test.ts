import * as admin from 'firebase-admin';
import { makeCountDraft, makeCreationTimeDraft, makeRefDraft } from 'kira-nosql';
import { None } from 'trimop';

import { getFirebaseTriggers } from '../src';
import { almostEqualTimeWith, createDoc, getDoc, test } from './util';

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

  const userOnCreateTrigger = triggers['user']?.onCreate;
  const memeImageOnCreateTrigger = triggers['memeImage']?.onCreate;
  const memeOnCreateTrigger = triggers['meme']?.onCreate;

  const user1Key = { col: 'user', id: 'user1' };
  const memeImage1key = { col: 'memeImage', id: 'memeImage1' };

  it('user on create trigger exists', () => {
    expect(userOnCreateTrigger).toBeDefined();
  });

  it('memeImage on create trigger exists', () => {
    expect(memeImageOnCreateTrigger).toBeDefined();
  });

  it('meme on create trigger exists', () => {
    expect(memeOnCreateTrigger).toBeDefined();
  });

  it('can create user1', async () => {
    const user1creationTime = new Date().getTime();
    await createDoc(
      user1Key,
      {
        _fromClient: true,
        displayName: 'user1',
        profilePicture: {
          url: 'https://sakurazaka46.com/images/14/eb2/a748ca8dac608af8edde85b62a5a8/1000_1000_102400.jpg',
        },
      },
      userOnCreateTrigger
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

  it('user1 can create memeImage1', async () => {
    const memeImage1creationTime = new Date().getTime();
    await createDoc(
      memeImage1key,
      {
        _fromClient: true,
        image: { url: 'https://i.ytimg.com/vi/abuAVZ6LpzM/hqdefault.jpg' },
        owner: { _id: 'user1' },
      },
      memeImageOnCreateTrigger
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
  });
});

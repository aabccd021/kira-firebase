import * as admin from 'firebase-admin';
import { makeCountDraft, makeCreationTimeDraft, makeRefDraft } from 'kira-nosql';
import { None } from 'trimop';

import { getFirebaseTriggers } from '../src';
import { createDoc, getDoc, test } from './util';

describe('Unit tests', () => {
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

  it('tests a Cloud Firestore function', async () => {
    const userOnCreateTrigger = triggers['user']?.onCreate;
    expect(userOnCreateTrigger).toBeDefined();

    const key = { col: 'user', id: 'user1' };
    await createDoc(key, { _fromClient: true, aab: 'ccd' }, userOnCreateTrigger);

    expect(await getDoc(key)).toStrictEqual({
      aab: 'ccd',
      joinedTime: expect.any(admin.firestore.Timestamp),
      memeCreatedCount: 0,
      memeImageCreatedCount: 0,
    });
  }, 5000);
});

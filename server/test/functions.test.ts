/* eslint-disable import/first */
import * as admin from 'firebase-admin';
const projectId = 'demo-kira-firebase';
admin.initializeApp({ projectId });

import * as functions from 'firebase-functions';
import { QueryDocumentSnapshot } from 'firebase-functions/lib/providers/firestore';
import * as functionsTest from 'firebase-functions-test';
import { CreationTimeField } from 'kira-core';
import { makeCountDraft, makeCreationTimeDraft, makeRefDraft } from 'kira-nosql';
import { None } from 'trimop';

import { getFirebaseTriggers } from '../src';

const test = functionsTest({ projectId });

describe('Unit tests', () => {
  afterAll(test.cleanup);
  it('tests a Cloud Firestore function', async () => {
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
        user: {
          joinedTime: CreationTimeField(),
        },
      },
    });
    const userOnCreateTrigger = triggers['user']?.onCreate;
    expect(userOnCreateTrigger).toBeDefined();
    const wrappedUserOnCreateTrigger = test.wrap(
      userOnCreateTrigger as functions.CloudFunction<QueryDocumentSnapshot>
    );
    await wrappedUserOnCreateTrigger(
      test.firestore.makeDocumentSnapshot(
        {
          _fromClient: true,
          aab: 'ccd',
        },
        '/user/user1'
      )
    );

    // Check the data in the Firestore emulator
    const snap = await admin.firestore().doc('/user/user1').get();
    expect(snap.data()).toStrictEqual({ text: 'hallo kira' });
  }, 5000);
});

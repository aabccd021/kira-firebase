/* eslint-disable import/first */
import * as admin from 'firebase-admin';
const projectId = 'demo-kira-firebase';
admin.initializeApp({ projectId });

import 'jest-extended';

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
    const id = '/user/user1';
    const snapshot = { _fromClient: true, aab: 'ccd' };
    await admin.firestore().doc(id).set(snapshot);
    await wrappedUserOnCreateTrigger(test.firestore.makeDocumentSnapshot(snapshot, id));

    // Check the data in the Firestore emulator
    const snap = await admin.firestore().doc(id).get();
    expect(snap.data()).toStrictEqual({
      aab: 'ccd',
      joinedTime: expect.any(admin.firestore.Timestamp),
    });
  }, 5000);
});

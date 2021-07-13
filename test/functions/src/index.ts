import * as admin from 'firebase-admin';
import {
  assertNever,
  CountField,
  CreationTimeField,
  getFirebaseTriggers,
  ImageField,
  makeCountDraft,
  makeCreationTimeDraft,
  makeImageDraft,
  makeRefDraft,
  makeStringDraft,
  RefField,
  // shouldRunTrigger,
  StringField,
} from 'kira-firebase-server';
// import * as functions from 'firebase-functions';

process.env['FIRESTORE_EMULATOR_HOST'] = 'localhost:8080';
process.env['FIREBASE_FIRESTORE_EMULATOR_ADDRESS'] = 'localhost:8080';
admin.initializeApp({ projectId: 'demo-kira' });

// export const finiteUpdate = functions.firestore
//   .document('finite/{docId}')
//   .onUpdate(async (snapshot) => {
//     if (await shouldRunTrigger({ snapshot:snapshot.after, fieldValue: admin.firestore.FieldValue })) {
//       await snapshot.after.ref.update({ name: 'Ms. ' + snapshot.after.data()['name'] });
//     }
//   });

export type Field = CountField | CreationTimeField | ImageField | RefField | StringField;

export const kira = getFirebaseTriggers<Field>({
  firestore: admin.firestore(),
  fieldValue: admin.firestore.FieldValue,
  version: {
    'kira-core': '0.3.8',
    'kira-firebase-server': '0.1.8',
  },
  cols: {
    user: {
      displayName: {
        type: 'string',
      },
      memeImageCreatedCount: {
        type: 'count',
        countedCol: 'memeImage',
        groupByRef: 'owner',
      },
      memeCreatedCount: {
        type: 'count',
        countedCol: 'meme',
        groupByRef: 'owner',
      },
      profilePicture: {
        type: 'image',
      },
      joinedTime: {
        type: 'creationTime',
      },
    },
    memeImage: {
      creationTime: {
        type: 'creationTime',
      },
      image: {
        type: 'image',
      },
      memeCreatedCount: {
        type: 'count',
        countedCol: 'meme',
        groupByRef: 'memeImage',
      },
      owner: {
        type: 'ref',
        isOwner: true,
        refedCol: 'user',
        syncFields: {
          profilePicture: true,
          displayName: true,
        },
        thisColRefers: [
          {
            colName: 'meme',
            fields: [{ name: 'meme', syncFields: {} }],
            thisColRefers: [],
          },
        ],
      },
    },
    meme: {
      memeImage: {
        type: 'ref',
        isOwner: false,
        refedCol: 'memeImage',
        syncFields: {
          image: true,
        },
        thisColRefers: [],
      },
      creationTime: {
        type: 'creationTime',
      },
      text: {
        type: 'string',
      },
      owner: {
        type: 'ref',
        isOwner: true,
        refedCol: 'user',
        syncFields: {
          profilePicture: true,
          displayName: true,
        },
        thisColRefers: [],
      },
    },
  },
  makeDraft: ({ fieldSpec, ...context }) => {
    if (fieldSpec.type === 'count') {
      return makeCountDraft({ ...context, fieldSpec });
    }
    if (fieldSpec.type === 'creationTime') {
      return makeCreationTimeDraft({ ...context, fieldSpec });
    }
    if (fieldSpec.type === 'image') {
      return makeImageDraft({ ...context, fieldSpec });
    }
    if (fieldSpec.type === 'ref') {
      return makeRefDraft({ ...context, fieldSpec });
    }
    if (fieldSpec.type === 'string') {
      return makeStringDraft({ ...context, fieldSpec });
    }
    assertNever(fieldSpec);
  },
});

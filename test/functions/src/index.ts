import { getApp } from './db';
import { Dictionary, getTriggers, shouldRunTrigger,Field } from 'kira-firebase-server';
import * as functions from 'firebase-functions'

export const finiteUpdate = functions.firestore.document('finite/{docId}').onUpdate(async (snapshot) => {
  if (await shouldRunTrigger(snapshot.after)) {
    await snapshot.after.ref.update({name: 'Ms. ' + snapshot.after.data()['name']})
  }
})



export const kira = getTriggers({
  firestore: getApp().firestore(),
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
        type: 'owner',
        syncFields: {
          profilePicture: true,
          displayName: true,
        },
      },
    },
    meme: {
      memeImage: {
        type: 'ref',
        refCol: 'memeImage',
        syncFields: {
          image: true,
        },
      },
      creationTime: {
        type: 'creationTime',
      },
      text: {
        type: 'string',
      },
      owner: {
        type: 'owner',
        syncFields: {
          profilePicture: true,
          displayName: true,
        },
      },
    },
  },
});

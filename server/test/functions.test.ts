import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { buildCountDraft, buildCreationTimeDraft, buildRefDraft } from 'kira-nosql';
import { None } from 'trimop';

import { getFirebaseTriggers, migrate } from '../src';
import { almostEqualTimeWith, createDoc, deleteDoc, setMergeDoc, sleep, test } from './util';

functions.logger.error = jest.fn();

describe('functions', () => {
  afterAll(test.cleanup);
  beforeEach(() => {
    (functions.logger.error as jest.Mock).mockClear();
  });

  describe('getFirebaseTriggers', () => {
    const triggers = getFirebaseTriggers({
      buildDraft: ({ spec, context }) => {
        if (spec._type === 'Count') {
          return buildCountDraft({ context, spec });
        }
        if (spec._type === 'Ref') {
          return buildRefDraft({ context, spec });
        }
        if (spec._type === 'CreationTime') {
          return buildCreationTimeDraft({ context, spec });
        }
        return None();
      },
      firestore: admin.firestore(),
      firestoreFieldValue: admin.firestore.FieldValue,
      spec: {
        independent: {
          foo: { _type: 'String' },
        },
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

    const user1Ref = '/user/user1';
    const memeImage1Ref = '/memeImage/memeImage1';
    const meme1Ref = '/meme/meme1';

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

      it('trigger does not run on create if no `_fromClient`', async () => {
        const user21Ref = '/user/user21';
        await createDoc(
          user21Ref,
          {
            displayName: 'user21',
            profilePicture: {
              url: 'https://sakurazaka46.com/images/14/eb2/a748ca8dac608af8edde85b62a5a8/1000_1000_102400.jpg',
            },
          },
          userTrigger?.onCreate
        );

        expect(
          await admin
            .firestore()
            .doc(user21Ref)
            .get()
            .then((snap) => snap.data())
        ).toStrictEqual({
          displayName: 'user21',
          profilePicture: {
            url: 'https://sakurazaka46.com/images/14/eb2/a748ca8dac608af8edde85b62a5a8/1000_1000_102400.jpg',
          },
        });
      });

      it('trigger does not run on create if doc is invalid', async () => {
        const user22Ref = '/user/user22';
        const memeImage22Ref = '/memeImage/memeImage22';
        await createDoc(
          user22Ref,
          {
            _fromClient: true,
            displayName: 'user22',
            profilePicture: {
              // should be url
              URL: 'https://sakurazaka46.com/images/14/eb2/a748ca8dac608af8edde85b62a5a8/1000_1000_102400.jpg',
            },
          },
          userTrigger?.onCreate
        );

        await createDoc(
          memeImage22Ref,
          {
            _fromClient: true,
            image: { url: 'https://i.ytimg.com/vi/abuAVZ6LpzM/hqdefault.jpg' },
            owner: { _id: 'user22' },
          },
          memeImageTrigger?.onCreate
        );

        expect(
          await admin
            .firestore()
            .doc(memeImage22Ref)
            .get()
            .then((snap) => snap.data())
        ).toStrictEqual({
          image: { url: 'https://i.ytimg.com/vi/abuAVZ6LpzM/hqdefault.jpg' },
          owner: { _id: 'user22' },
        });

        expect(functions.logger.error).toHaveBeenCalledWith('Failed to get transaction commit', {
          snapshot: {
            doc: {
              image: {
                _type: 'Image',
                value: { url: 'https://i.ytimg.com/vi/abuAVZ6LpzM/hqdefault.jpg' },
              },
              owner: {
                _type: 'Ref',
                snapshot: { doc: { _id: { _type: 'String', value: 'user22' } }, id: 'user22' },
              },
            },
            id: 'memeImage22',
          },
          transactionCommit: {
            _tag: 'Left',
            errorObject: expect.any(Error),
            left: {
              _errorType: 'GetDocError',
              _getDocErrorType: 'FirestoreToDocGetDoc',
              doc: {
                displayName: 'user22',
                profilePicture: {
                  URL: 'https://sakurazaka46.com/images/14/eb2/a748ca8dac608af8edde85b62a5a8/1000_1000_102400.jpg',
                },
              },
              field: {
                URL: 'https://sakurazaka46.com/images/14/eb2/a748ca8dac608af8edde85b62a5a8/1000_1000_102400.jpg',
              },
              fieldName: 'profilePicture',
            },
          },
        });
      });

      it('can create user1', async () => {
        user1creationTime = new Date().getTime();
        await createDoc(
          user1Ref,
          {
            _fromClient: true,
            displayName: 'user1',
            profilePicture: {
              url: 'https://sakurazaka46.com/images/14/eb2/a748ca8dac608af8edde85b62a5a8/1000_1000_102400.jpg',
            },
          },
          userTrigger?.onCreate
        );

        expect(
          await admin
            .firestore()
            .doc(user1Ref)
            .get()
            .then((snap) => snap.data())
        ).toStrictEqual({
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
        memeImage1creationTime = new Date().getTime();
        await createDoc(
          memeImage1Ref,
          {
            _fromClient: true,
            image: { url: 'https://i.ytimg.com/vi/abuAVZ6LpzM/hqdefault.jpg' },
            owner: { _id: 'user1' },
          },
          memeImageTrigger?.onCreate
        );

        expect(
          await admin
            .firestore()
            .doc(memeImage1Ref)
            .get()
            .then((snap) => snap.data())
        ).toStrictEqual({
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

        expect(
          await admin
            .firestore()
            .doc(user1Ref)
            .get()
            .then((snap) => snap.data())
        ).toStrictEqual({
          displayName: 'user1',
          joinedTime: expect.toSatisfy(almostEqualTimeWith(user1creationTime)),
          memeCreatedCount: 0,
          memeImageCreatedCount: 1,
          profilePicture: {
            url: 'https://sakurazaka46.com/images/14/eb2/a748ca8dac608af8edde85b62a5a8/1000_1000_102400.jpg',
          },
        });
      });

      it('user1 can create meme1', async () => {
        meme1creationTime = new Date().getTime();
        await createDoc(
          meme1Ref,
          {
            _fromClient: true,
            memeImage: { _id: 'memeImage1' },
            owner: { _id: 'user1' },
            text: 'L eats banana',
          },
          memeTrigger?.onCreate
        );

        expect(
          await admin
            .firestore()
            .doc(meme1Ref)
            .get()
            .then((snap) => snap.data())
        ).toStrictEqual({
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

        expect(
          await admin
            .firestore()
            .doc(memeImage1Ref)
            .get()
            .then((snap) => snap.data())
        ).toStrictEqual({
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

        expect(
          await admin
            .firestore()
            .doc(user1Ref)
            .get()
            .then((snap) => snap.data())
        ).toStrictEqual({
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
          user1Ref,
          {
            _fromClient: true,
            displayName: 'kira masumoto',
          },
          userTrigger?.onUpdate
        );
        await sleep(5000);

        expect(
          await admin
            .firestore()
            .doc(meme1Ref)
            .get()
            .then((snap) => snap.data())
        ).toStrictEqual({
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

        expect(
          await admin
            .firestore()
            .doc(memeImage1Ref)
            .get()
            .then((snap) => snap.data())
        ).toStrictEqual({
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

        expect(
          await admin
            .firestore()
            .doc(user1Ref)
            .get()
            .then((snap) => snap.data())
        ).toStrictEqual({
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
          memeImage1Ref,
          {
            _fromClient: true,
            image: {
              url: 'https://sakurazaka46.com/images/14/018/c4e6c7ada458d9bdd8eefeee7acaf-01.jpg',
            },
          },
          memeImageTrigger?.onUpdate
        );
        await sleep(5000);

        expect(
          await admin
            .firestore()
            .doc(meme1Ref)
            .get()
            .then((snap) => snap.data())
        ).toStrictEqual({
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

        expect(
          await admin
            .firestore()
            .doc(memeImage1Ref)
            .get()
            .then((snap) => snap.data())
        ).toStrictEqual({
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

        expect(
          await admin
            .firestore()
            .doc(user1Ref)
            .get()
            .then((snap) => snap.data())
        ).toStrictEqual({
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

    describe('on delete', () => {
      it('user trigger exists', () => {
        expect(userTrigger?.onDelete).toBeDefined();
      });

      it('memeImage trigger exists', () => {
        expect(memeImageTrigger?.onDelete).toBeDefined();
      });

      it('meme trigger exists', () => {
        expect(memeTrigger?.onDelete).toBeDefined();
      });

      it('user1 can be deleted', async () => {
        await deleteDoc(user1Ref, userTrigger?.onDelete);

        await sleep(5000);

        expect(
          await admin
            .firestore()
            .doc(meme1Ref)
            .get()
            .then((snap) => snap.exists)
        ).toStrictEqual(false);

        expect(
          await admin
            .firestore()
            .doc(memeImage1Ref)
            .get()
            .then((snap) => snap.exists)
        ).toStrictEqual(false);

        expect(
          await admin
            .firestore()
            .doc(user1Ref)
            .get()
            .then((snap) => snap.exists)
        ).toStrictEqual(false);
      }, 10000);
    });
  });

  describe('migrate', () => {
    it('do not run anything if any key is wrong', async () => {
      const mockMigration1 = jest.fn();
      const mockMigration2 = jest.fn();
      await expect(
        migrate({
          firestore: admin.firestore(),
          migrations: {
            '2021-07-28T00:00:00Z': mockMigration1,
            '2021-07-29T00:00:00A': mockMigration2,
          },
        })
      ).rejects.toThrow('Invalid time value');

      expect(mockMigration1).not.toHaveBeenCalled();
      expect(mockMigration2).not.toHaveBeenCalled();
    });

    it('can migrate with proper order', async () => {
      const mockMigration1 = jest.fn();
      const mockMigration2 = jest.fn();
      await migrate({
        firestore: admin.firestore(),
        migrations: {
          '2021-07-28T00:00:00Z': mockMigration1,
          '2021-07-29T00:00:00Z': mockMigration2,
        },
      });

      expect(mockMigration1).toHaveBeenCalledTimes(1);
      expect(mockMigration2).toHaveBeenCalledTimes(1);
      expect(mockMigration1).toHaveBeenCalledBefore(mockMigration2);
    });

    it('would not migrate if alredy done', async () => {
      const mockMigration1 = jest.fn();
      const mockMigration2 = jest.fn();
      await migrate({
        firestore: admin.firestore(),
        migrations: {
          '2021-07-28T00:00:00Z': mockMigration1,
          '2021-07-29T00:00:00Z': mockMigration2,
        },
      });

      expect(mockMigration1).not.toHaveBeenCalled();
      expect(mockMigration2).not.toHaveBeenCalled();
    });

    it('run if there is new migration', async () => {
      const mockMigration1 = jest.fn();
      const mockMigration2 = jest.fn();
      const mockMigration3 = jest.fn();
      await migrate({
        firestore: admin.firestore(),
        migrations: {
          '2021-07-28T00:00:00Z': mockMigration1,
          '2021-07-29T00:00:00Z': mockMigration2,
          '2021-07-30T00:00:00Z': mockMigration3,
        },
      });

      expect(mockMigration1).not.toHaveBeenCalled();
      expect(mockMigration2).not.toHaveBeenCalled();
      expect(mockMigration3).toHaveBeenCalledTimes(1);
    });
  });
});

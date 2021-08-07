import { hello } from '../src/kira';
import { firestore, functions, test } from './util';

describe('Unit tests', () => {
  afterAll(test.cleanup);
  it('tests a Cloud Firestore function', async () => {
    const wrapped = test.wrap(
      functions.firestore.document('/lowercase/{doc}').onCreate((doc) =>
        firestore
          .collection('uppercase')
          .doc(doc.id)
          .set({ text: hello(doc.data()['text']) })
      )
    );

    // Make a fake document snapshot to pass to the function
    const after = test.firestore.makeDocumentSnapshot({ text: 'kira' }, '/lowercase/foo');

    // Call the function
    await wrapped(after);

    // Check the data in the Firestore emulator
    const snap = await firestore.doc('/uppercase/foo').get();
    expect(snap.data()).toStrictEqual({ text: 'hallo kira' });
  }, 5000);
});

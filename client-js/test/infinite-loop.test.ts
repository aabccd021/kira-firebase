import { doc, getDoc, setDoc } from 'firebase/firestore/lite';

import { firestore, sleep } from './util';

describe('infinite loop', () => {
  it('should not happen on `finite` collection', async () => {
    // create
    const ref = doc(firestore, 'finite/finite1');
    await setDoc(ref, {
      name: 'kira',
      _fromClient: true,
    });
    await sleep(5000);

    expect((await getDoc(ref)).data()).toStrictEqual({
      name: 'kira',
      _fromClient: true,
    });

    // update
    await setDoc(ref, {
      name: 'Masumoto',
      _fromClient: true,
    });
    await sleep(5000);

    expect((await getDoc(ref)).data()).toStrictEqual({
      name: 'Ms. Masumoto',
    });
  }, 15000);
});

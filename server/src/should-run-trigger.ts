import { firestore } from 'firebase-admin';
import { QueryDocumentSnapshot } from 'firebase-functions/lib/providers/firestore';

/**
 *
 */
export const FROM_CLIENT_FLAG = '_fromClient';

/**
 * Prevent infinite loop.
 * Trigger should only run when it's triggered from client.
 */
export async function shouldRunTrigger(snapshot: QueryDocumentSnapshot): Promise<boolean> {
  // Stop functions if has no client flag
  if (snapshot.data()[FROM_CLIENT_FLAG] !== true) {
    return false;
  }
  // Remove flag
  await snapshot.ref.update({ [FROM_CLIENT_FLAG]: firestore.FieldValue.delete() });
  return true;
}

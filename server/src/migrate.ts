import * as admin from 'firebase-admin';

export async function migrate({
  key,
  migration,
  firestore,
  latestMigrationFieldName = 'latest_migration',
  colName = '__meta',
  docId = 'kira_firebase_server',
}: {
  readonly colName?: string;
  readonly docId?: string;
  readonly firestore: admin.firestore.Firestore;
  readonly key: string;
  readonly latestMigrationFieldName?: string;
  readonly migration: () => Promise<void>;
}): Promise<void> {
  const kiraDoc = firestore.collection(colName).doc(docId);
  const kiraData = await kiraDoc.get().then((snapshot) => snapshot.data());
  const latestMigrationDateStr = kiraData?.[latestMigrationFieldName];
  if (latestMigrationDateStr === undefined || new Date(latestMigrationDateStr) < new Date(key)) {
    await migration();
    kiraDoc.set({ [latestMigrationFieldName]: key });
  }
}

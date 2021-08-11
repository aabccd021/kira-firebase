import * as admin from 'firebase-admin';
import { Dict } from 'trimop';

import { Migration } from './type';

export async function migrate({
  migrations,
  firestore,
  latestMigrationFieldName = 'latest_migration',
  colName = '__meta',
  docId = 'kira_firebase_server',
}: {
  readonly colName?: string;
  readonly docId?: string;
  readonly firestore: admin.firestore.Firestore;
  readonly latestMigrationFieldName?: string;
  readonly migrations: Dict<Migration>;
}): Promise<void> {
  const doc = firestore.collection(colName).doc(docId);
  const latestMigrationDateStr = (await doc.get().then((snapshot) => snapshot.data()))?.[
    latestMigrationFieldName
  ];
  // eslint-disable-next-line functional/no-loop-statement
  for (const { dateStr, migration } of Object.entries(migrations)
    .map(([key, migration]) => ({
      dateStr: new Date(key).toISOString(),
      migration,
    }))
    .sort((a, b) => new Date(a.dateStr).getTime() - new Date(b.dateStr).getTime())) {
    if (
      latestMigrationDateStr === undefined ||
      new Date(latestMigrationDateStr).getTime() < new Date(dateStr).getTime()
    ) {
      await migration();
      await doc.set({ [latestMigrationFieldName]: dateStr });
    }
  }
}

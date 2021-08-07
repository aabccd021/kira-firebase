import * as admin from 'firebase-admin';
import * as functionsTest from 'firebase-functions-test';

const projectId = 'demo-kira-firebase';

admin.initializeApp({ projectId });

export const test = functionsTest({ projectId });

export const firestore = admin.firestore();

// import functions after initializeApp to avoid warning
export * as functions from 'firebase-functions';

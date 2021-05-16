import { FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore/lite';
import { getStorage } from 'firebase/storage';
import {
  ApOnStateChanged,
  ApSignIn,
  ApSignOut,
  ApUserCredToId,
  AuthState as CoreAuthState,
  CreateDocState as CoreCreateDocState,
  DbpGetNewDocId,
  DbpQuery,
  DbpReadDoc,
  DbpSetDoc,
  Dictionary,
  Doc,
  DocData,
  DocKey,
  DocState as CoreDocState,
  Field,
  initAuth,
  LoadingUserDataAuthState,
  makeAuth,
  makeCreateDoc as coreMakeCreateDoc,
  makeDoc as coreMakeDoc,
  makeQuery as coreMakeQuery,
  Observable,
  OCDocData,
  OnCreated,
  OnReset,
  Query,
  QueryState as CoreQueryState,
  Schema,
  SignedInAuthState as CoreSignedInAuthState,
  SignedOutAuthState as CoreSignedOutAuthState,
  SpUploadFile,
  Unsubscribe,
  UserCredToDefaultDoc,
} from 'kira-client';

import {
  apUserCredToId,
  AuthError,
  AuthProviderKey,
  makeApOnAuthStateChanged,
  makeApSignIn,
  makeApSignOut,
  SignInOption,
  UserCredential,
} from './auth';
import {
  DBCursor,
  DBError,
  makeDbpGetNewDocId,
  makeDbpQuery,
  makeDbpReadDoc,
  makeDbpSetDoc,
} from './db';
import { makeSpUploadFile, StorageConfig, StorageError } from './storage';

function appConfigToApOnAuthStateChanged(appConfig: {
  readonly firebaseApp: FirebaseApp;
}): ApOnStateChanged<AuthError, UserCredential> {
  return makeApOnAuthStateChanged(getAuth(appConfig.firebaseApp));
}

function appConfigToApSignIn(appConfig: {
  readonly firebaseApp: FirebaseApp;
}): ApSignIn<SignInOption> {
  return makeApSignIn(getAuth(appConfig.firebaseApp));
}

function appConfigToApSignOut(appConfig: { readonly firebaseApp: FirebaseApp }): ApSignOut {
  return makeApSignOut(getAuth(appConfig.firebaseApp));
}

function appConfigToApUserCredToId(_: {
  readonly firebaseApp: FirebaseApp;
}): ApUserCredToId<UserCredential> {
  return apUserCredToId;
}

function appConfigToDbpReadDoc(appConfig: {
  readonly firebaseApp: FirebaseApp;
}): DbpReadDoc<DBError> {
  return makeDbpReadDoc(getFirestore(appConfig.firebaseApp));
}

function appConfigToDbpSetDoc(appConfig: {
  readonly firebaseApp: FirebaseApp;
}): DbpSetDoc<DBError> {
  return makeDbpSetDoc(getFirestore(appConfig.firebaseApp));
}

function appConfigToDbpGetNewDocId(appConfig: {
  readonly firebaseApp: FirebaseApp;
}): DbpGetNewDocId<DBError> {
  return makeDbpGetNewDocId(getFirestore(appConfig.firebaseApp));
}

function appConfigToDbpQuery(appConfig: {
  readonly firebaseApp: FirebaseApp;
}): DbpQuery<DBCursor, DBError> {
  return makeDbpQuery(getFirestore(appConfig.firebaseApp));
}

function appConfigTospUploadFile(appConfig: {
  readonly firebaseApp: FirebaseApp;
  readonly serviceConfig: { readonly storagePathPrefix?: string };
}): SpUploadFile<StorageError> {
  return makeSpUploadFile(getStorage(appConfig.firebaseApp), {
    pathPrefix: appConfig.serviceConfig.storagePathPrefix,
  });
}

export function initializeKira(
  appConfig: {
    readonly firebaseApp: FirebaseApp;
    readonly serviceConfig: ServiceConfig;
    readonly userCredToDefaultDoc: UserCredToDefaultDoc<UserCredential>;
  },
  schema: Schema
): Unsubscribe {
  return initAuth<AuthError, DBError, StorageError, SignInOption, UserCredential>({
    schema,
    onAuthStateChanged: appConfigToApOnAuthStateChanged(appConfig),
    signIn: appConfigToApSignIn(appConfig),
    signOut: appConfigToApSignOut(appConfig),
    userCredToId: appConfigToApUserCredToId(appConfig),
    dbpSetDoc: appConfigToDbpSetDoc(appConfig),
    dbpReadDoc: appConfigToDbpReadDoc(appConfig),
    dbpGetNewDocId: appConfigToDbpGetNewDocId(appConfig),
    spUploadFile: appConfigTospUploadFile(appConfig),
    userCredToDefaultDoc: appConfig.userCredToDefaultDoc,
  });
}

export function makeDoc({
  collection,
  id,
  appConfig,
  schema,
}: {
  readonly collection: string;
  readonly id?: string;
  readonly appConfig: {
    readonly firebaseApp: FirebaseApp;
    readonly serviceConfig: { readonly storagePathPrefix?: string };
  };
  readonly schema: { readonly cols: Dictionary<Dictionary<Field>> };
}): Observable<DocState> {
  return coreMakeDoc({
    collection,
    id,
    schema,
    dbpSetDoc: appConfigToDbpSetDoc(appConfig),
    dbpReadDoc: appConfigToDbpReadDoc(appConfig),
    dbpGetNewDocId: appConfigToDbpGetNewDocId(appConfig),
    spUploadFile: appConfigTospUploadFile(appConfig),
  }) as Observable<DocState>;
}

export function makeCreateDoc({
  colName,
  appConfig,
  schema,
  ownerless,
  onReset,
  onCreated,
}: {
  readonly colName: string;
  readonly appConfig: {
    readonly firebaseApp: FirebaseApp;
    readonly serviceConfig: { readonly storagePathPrefix?: string };
  };
  readonly schema: { readonly cols: Dictionary<Dictionary<Field>> };
  readonly ownerless?: true;
  readonly onReset?: OnReset;
  readonly onCreated?: OnCreated<DocKey>;
}): Observable<CreateDocState> {
  return coreMakeCreateDoc({
    colName,
    schema,
    dbpSetDoc: appConfigToDbpSetDoc(appConfig),
    dbpGetNewDocId: appConfigToDbpGetNewDocId(appConfig),
    spUploadFile: appConfigTospUploadFile(appConfig),
    ownerless,
    onReset,
    onCreated,
  });
}

export function makeQuery({
  query,
  appConfig,
}: {
  readonly query: Query;
  readonly appConfig: { readonly firebaseApp: FirebaseApp };
}): Observable<QueryState> {
  return coreMakeQuery({
    query,
    dbpQuery: appConfigToDbpQuery(appConfig),
  });
}

export { makeAuth };

export type {
  AuthProviderKey,
  Doc,
  DocData,
  DocKey,
  FirebaseApp,
  LoadingUserDataAuthState,
  Observable,
  OCDocData,
  OnCreated,
  OnReset,
  Query,
  Schema,
  StorageConfig,
  UserCredential,
};

export type ServiceConfig = {
  readonly storagePathPrefix?: string;
};

export type AppConfig<T extends OCDocData = OCDocData> = {
  readonly firebaseApp: FirebaseApp;
  readonly serviceConfig: ServiceConfig;
  readonly userCredToDefaultDoc: UserCredToDefaultDoc<UserCredential, T>;
};

export type AuthState<U extends DocData = DocData> = CoreAuthState<
  AuthError,
  DBError,
  SignInOption,
  U
>;

export type SignedOutAuthState = CoreSignedOutAuthState<AuthError, DBError, SignInOption>;
export type SignedInAuthState<U extends DocData = DocData> = CoreSignedInAuthState<
  AuthError,
  DBError,
  U
>;

export type DocState<
  C extends string = string,
  T extends DocData = DocData,
  TC extends OCDocData = OCDocData
> = CoreDocState<DBError, C, T, TC>;

export type CreateDocState<C extends string = string, T extends OCDocData = OCDocData> =
  CoreCreateDocState<DBError, StorageError, C, T>;

export type QueryState<C extends string = string> = CoreQueryState<DBError, C>;

import { assertNever } from 'assert-never';
import {
  Auth as FirebaseAuth,
  AuthProvider,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import { ApOnStateChanged, ApSignIn, ApSignOut, ApUserCredToId } from 'kira-client';

function getAuthProvider(provider: AuthProviderKey): AuthProvider {
  if (provider === 'google') return new GoogleAuthProvider();
  assertNever(provider);
}

export type AuthProviderKey = 'google';
export type SignInOption = { readonly provider: AuthProviderKey; readonly with: 'popup' };
export type AuthError = Error;
export type UserCredential = User;

export function makeApOnAuthStateChanged(
  auth: FirebaseAuth
): ApOnStateChanged<AuthError, UserCredential> {
  return ({ signIn, signOut, error }) =>
    onAuthStateChanged(
      auth,
      (userCred) => {
        if (userCred) signIn({ userCred });
        else signOut();
      },
      (err) => error({ error: err })
    );
}

export function makeApSignIn(auth: FirebaseAuth): ApSignIn<SignInOption> {
  return (signInOption) => {
    if (signInOption.with === 'popup') {
      return signInWithPopup(auth, getAuthProvider(signInOption.provider));
    }

    return assertNever(signInOption.with);
  };
}

export function makeApSignOut(auth: FirebaseAuth): ApSignOut {
  // eslint-disable-next-line functional/functional-parameters
  return () => signOut(auth);
}

export const apUserCredToId: ApUserCredToId<UserCredential> = (userCred) => userCred.uid;

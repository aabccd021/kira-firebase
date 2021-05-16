import { getDownloadURL, ref, StorageService, uploadBytes } from 'firebase/storage';
import { Either, SpUploadFile } from 'kira-client';

export type StorageError = Error;

export type StorageConfig = { readonly pathPrefix?: string };
export function makeSpUploadFile(
  storage: StorageService,
  option?: StorageConfig
): SpUploadFile<StorageError> {
  return async ({ id, colName, fieldName, file, auth }) =>
    uploadBytes(
      ref(
        storage,
        `${option?.pathPrefix ? `${option.pathPrefix}/` : ''}${colName}/${id}/${fieldName}/raw`
      ),
      file,
      {
        customMetadata: auth.state === 'signedIn' ? { ownerUid: auth.id } : undefined,
      }
    )
      .then<Either<{ readonly downloadUrl: string }, StorageError>>((uploadResult) =>
        getDownloadURL(uploadResult.ref).then((downloadUrl) => ({
          _tag: 'right',
          value: { downloadUrl },
        }))
      )
      .catch((error) => ({ _tag: 'left', error }));
}

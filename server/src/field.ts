import assertNever from 'assert-never';
import * as admin from 'firebase-admin';
import {
  Field,
  makeCountTrigger,
  makeCreationTimeTrigger,
  makeImageTrigger,
  makeRefTrigger,
  makeStringTrigger,
  Trigger,
} from 'kira-nosql';

export function makeTrigger({
  fieldSpec,
  ...context
}: {
  readonly colName: string;
  readonly fieldName: string;
  readonly fieldSpec: Field;
}): Trigger<Error, admin.firestore.WriteResult> {
  if (fieldSpec.type === 'count') {
    return makeCountTrigger({ ...context, fieldSpec });
  }
  if (fieldSpec.type === 'creationTime') {
    return makeCreationTimeTrigger({ ...context, fieldSpec });
  }
  if (fieldSpec.type === 'image') {
    return makeImageTrigger({ ...context, fieldSpec });
  }
  if (fieldSpec.type === 'ref') {
    return makeRefTrigger({ ...context, fieldSpec });
  }
  if (fieldSpec.type === 'string') {
    return makeStringTrigger({ ...context, fieldSpec });
  }
  assertNever(fieldSpec);
}

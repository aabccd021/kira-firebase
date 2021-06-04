import { Schema_1, Schema_2, schemaToActions_1, schemaToActions_2 } from 'kira-nosql';

import { GetTriggers } from './type';
import { getTriggers } from './util';

export const getTriggers_1: GetTriggers<Schema_1> = ({ schema, ...context }) => {
  return getTriggers({ ...context, schema, actions: schemaToActions_1(schema) });
};

export const getTriggers_2: GetTriggers<Schema_2> = ({ schema, ...context }) => {
  return getTriggers({ ...context, schema, actions: schemaToActions_2(schema) });
};

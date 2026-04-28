import { reset } from 'drizzle-seed';

import { db } from '../index';
import * as schema from '../schema';

async function main() {
  await reset(db, schema);
}

void main();

import { reset } from 'drizzle-seed';

import { db } from '../index.js';
import * as schema from '../schema/index.js';

async function main() {
  await reset(db, schema);
}

void main();

import { Global, Module } from '@nestjs/common';

import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { DrizzleService } from './drizzle.service.js';

import { db } from '../db/index.js';
import * as schema from '../db/schema/index.js';

export const DRIZZLE = 'DRIZZLE';
export type DrizzleDB = NodePgDatabase<typeof schema>;

@Global()
@Module({
  providers: [
    DrizzleService,
    {
      provide: DRIZZLE,
      useValue: db,
    },
  ],
  exports: [DRIZZLE],
})
export class DrizzleModule {}

import { Global, Module } from '@nestjs/common';

import { NodePgDatabase } from 'drizzle-orm/node-postgres';

import { DrizzleController } from './drizzle.controller';
import { DrizzleService } from './drizzle.service';

import { db } from '../db';
import * as schema from '../db/schema';

export const DRIZZLE = 'DRIZZLE';
export type DrizzleDB = NodePgDatabase<typeof schema>;

@Global()
@Module({
  controllers: [DrizzleController],
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

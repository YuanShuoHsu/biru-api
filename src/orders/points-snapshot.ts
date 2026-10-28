import { sql } from 'drizzle-orm';
import type { PgUpdateSetSource } from 'drizzle-orm/pg-core';
import type { order } from '../db/schema/orders.js';
import { pointSetting } from '../db/schema/points.js';

export const POINTS_SNAPSHOT_SET = {
  amountPerPoint: sql`(SELECT ${pointSetting.amountPerPoint} FROM ${pointSetting})`,
  pointsValidityYears: sql`(SELECT ${pointSetting.pointsValidityYears} FROM ${pointSetting})`,
} satisfies PgUpdateSetSource<typeof order>;

import { sql } from 'drizzle-orm';
import type { PgUpdateSetSource } from 'drizzle-orm/pg-core';
import { order } from 'src/db/schema/orders';

export const POINTS_SNAPSHOT_SET = {
  amountPerPoint: sql`(SELECT o.amount_per_point FROM organization o WHERE o.id = ${order.sellerId})`,
  pointsValidityYears: sql`(SELECT o.points_validity_years FROM organization o WHERE o.id = ${order.sellerId})`,
} satisfies PgUpdateSetSource<typeof order>;

import { sql } from 'drizzle-orm';
import {
  check,
  numeric,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { timestamps } from './columns.helpers.js';
import { organization } from './organizations.js';

export const operatingCostCategoryEnum = pgEnum('operating_cost_category', [
  'rent',
  'electricity',
  'water',
  'gas',
  'telecom',
  'insurance',
  'equipment',
  'marketing',
  'personnel',
  'other',
]);
export type OperatingCostCategory =
  (typeof operatingCostCategoryEnum.enumValues)[number];

export const operatingCost = pgTable(
  'operating_cost',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    category: operatingCostCategoryEnum('category').notNull(),
    effectiveFrom: text('effective_from').notNull(),
    monthlyAmount: numeric('monthly_amount', {
      precision: 12,
      scale: 2,
    }).notNull(),
    note: text('note'),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('operatingCost_organizationId_category_effectiveFrom_uidx').on(
      table.organizationId,
      table.category,
      table.effectiveFrom,
    ),
    check(
      'operating_cost_effective_from_check',
      sql`${table.effectiveFrom} ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'`,
    ),
    check(
      'operating_cost_monthly_amount_check',
      sql`${table.monthlyAmount} >= 0`,
    ),
  ],
);

export type OperatingCost = typeof operatingCost.$inferSelect;

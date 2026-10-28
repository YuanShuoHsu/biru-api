import { integer, jsonb, pgTable, text } from 'drizzle-orm/pg-core';

import { timestamps } from './columns.helpers.js';
import { organization } from './organizations.js';

export const STORE_LAYOUT_FLOORS = ['ground', 'upper', 'roof'] as const;
export type StoreLayoutFloor = (typeof STORE_LAYOUT_FLOORS)[number];

export const STORE_LAYOUT_ITEM_KINDS = [
  'wash',
  'prep',
  'heat',
  'cold',
  'storage',
  'front',
  'bar',
  'equipment',
  'restroom',
  'seat',
  'plant',
  'lawn',
] as const;
export type StoreLayoutItemKind = (typeof STORE_LAYOUT_ITEM_KINDS)[number];

export type StoreLayoutBox = {
  floor: StoreLayoutFloor;
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  elevation: number;
  label: string;
};

export type StoreLayoutItem = StoreLayoutBox & {
  kind: StoreLayoutItemKind;
  tableNumber?: number;
};

export type StoreLayoutData = {
  items: StoreLayoutItem[];
  seats: StoreLayoutBox[];
};

export const storeLayout = pgTable('store_layout', {
  organizationId: text('organization_id')
    .primaryKey()
    .references(() => organization.id, { onDelete: 'cascade' }),
  schemaVersion: integer('schema_version').notNull().default(1),
  data: jsonb('data').$type<StoreLayoutData>().notNull(),
  ...timestamps,
});

export type StoreLayout = typeof storeLayout.$inferSelect;

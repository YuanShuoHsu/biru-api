import {
  boolean,
  doublePrecision,
  index,
  integer,
  json,
  pgTable,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';

import { stores } from './stores';

export const menus = pgTable(
  'menus',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    key: text('key').notNull(),
    name: json('name').default({}).notNull(),
    createdAt: timestamp('createdAt', { mode: 'date' }).defaultNow().notNull(),
    isActive: boolean('isActive').default(true).notNull(),
    updatedAt: timestamp('updatedAt', { mode: 'date' })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    storeId: text('storeId')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
  },
  (table) => {
    return {
      storeIdKeyUnique: unique().on(table.storeId, table.key),
      storeIdIdx: index('menus_storeId_idx').on(table.storeId),
    };
  },
);

export const menuItems = pgTable(
  'menu_items',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    key: text('key').notNull(),
    name: json('name').default({}).notNull(),
    createdAt: timestamp('createdAt', { mode: 'date' }).defaultNow().notNull(),
    description: json('description').default({}).notNull(),
    imageUrl: text('imageUrl').default('/images/IMG_4590.jpg').notNull(),
    isActive: boolean('isActive').default(true).notNull(),
    price: integer('price').notNull(),
    sold: integer('sold').default(0).notNull(),
    stock: integer('stock'),
    updatedAt: timestamp('updatedAt', { mode: 'date' })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    menuId: text('menuId')
      .notNull()
      .references(() => menus.id, { onDelete: 'cascade' }),
  },
  (table) => {
    return {
      menuIdKeyUnique: unique().on(table.menuId, table.key),
      menuIdIdx: index('menu_items_menuId_idx').on(table.menuId),
    };
  },
);

export const menuItemOptions = pgTable(
  'menu_item_options',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    key: text('key').notNull(),
    name: json('name').default({}).notNull(),
    createdAt: timestamp('createdAt', { mode: 'date' }).defaultNow().notNull(),
    isActive: boolean('isActive').default(true).notNull(),
    multiple: boolean('multiple').default(false).notNull(),
    required: boolean('required').default(false).notNull(),
    updatedAt: timestamp('updatedAt', { mode: 'date' })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    menuItemId: text('menuItemId')
      .notNull()
      .references(() => menuItems.id, { onDelete: 'cascade' }),
  },
  (table) => {
    return {
      menuItemIdKeyUnique: unique().on(table.menuItemId, table.key),
      menuItemIdIdx: index('menu_item_options_menuItemId_idx').on(
        table.menuItemId,
      ),
    };
  },
);

export const menuItemIngredients = pgTable(
  'menu_item_ingredients',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    key: text('key').notNull(),
    name: json('name').default({}).notNull(),
    createdAt: timestamp('createdAt', { mode: 'date' }).defaultNow().notNull(),
    unit: json('unit').default({}).notNull(),
    updatedAt: timestamp('updatedAt', { mode: 'date' })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    usage: doublePrecision('usage').notNull(),
    menuItemId: text('menuItemId')
      .notNull()
      .references(() => menuItems.id, { onDelete: 'cascade' }),
  },
  (table) => {
    return {
      menuItemIdKeyUnique: unique().on(table.menuItemId, table.key),
      menuItemIdIdx: index('menu_item_ingredients_menuItemId_idx').on(
        table.menuItemId,
      ),
    };
  },
);

export const menuItemOptionChoices = pgTable(
  'menu_item_option_choices',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    key: text('key').notNull(),
    name: json('name').default({}).notNull(),
    createdAt: timestamp('createdAt', { mode: 'date' }).defaultNow().notNull(),
    extraCost: integer('extraCost').default(0).notNull(),
    isActive: boolean('isActive').default(true).notNull(),
    isShared: boolean('isShared').default(false).notNull(),
    sold: integer('sold').default(0).notNull(),
    stock: integer('stock'),
    updatedAt: timestamp('updatedAt', { mode: 'date' })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    menuItemOptionId: text('menuItemOptionId')
      .notNull()
      .references(() => menuItemOptions.id, { onDelete: 'cascade' }),
  },
  (table) => {
    return {
      menuItemOptionIdKeyUnique: unique().on(table.menuItemOptionId, table.key),
      menuItemOptionIdIdx: index('menu_item_option_id_idx').on(
        table.menuItemOptionId,
      ),
    };
  },
);

export const menuItemOptionChoiceIngredients = pgTable(
  'menu_item_option_choice_ingredients',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    key: text('key').notNull(),
    name: json('name').default({}).notNull(),
    createdAt: timestamp('createdAt', { mode: 'date' }).defaultNow().notNull(),
    unit: json('unit').default({}).notNull(),
    updatedAt: timestamp('updatedAt', { mode: 'date' })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
    usage: doublePrecision('usage').notNull(),
    menuItemOptionChoiceId: text('menuItemOptionChoiceId')
      .notNull()
      .references(() => menuItemOptionChoices.id, { onDelete: 'cascade' }),
  },
  (table) => {
    return {
      menuItemOptionChoiceIdKeyUnique: unique().on(
        table.menuItemOptionChoiceId,
        table.key,
      ),
      menuItemOptionChoiceIdIdx: index(
        'menu_item_option_choice_ingredients_menuItemOptionChoiceId',
      ).on(table.menuItemOptionChoiceId),
    };
  },
);

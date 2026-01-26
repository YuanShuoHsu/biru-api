import { relations } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  index,
  integer,
  json,
  pgTable,
  text,
  unique,
} from 'drizzle-orm/pg-core';
import type { LocalizedText } from 'src/common/types/locale';

import { timestamps } from './columns.helpers';

export const stores = pgTable('stores', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: json('name').default({}).notNull().$type<LocalizedText>(),
  address: text('address').default('').notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  slug: text('slug').unique().notNull(),
  ...timestamps,
});

export const tables = pgTable(
  'tables',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    storeId: text('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    name: json('name').default({}).notNull().$type<LocalizedText>(),
    isActive: boolean('is_active').default(true).notNull(),
    slug: text('slug').notNull(),
    ...timestamps,
  },
  (table) => [
    unique().on(table.storeId, table.slug),
    index('tables_storeId_idx').on(table.storeId),
  ],
);

export const menus = pgTable(
  'menus',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    key: text('key').notNull(),
    name: json('name').default({}).notNull().$type<LocalizedText>(),
    isActive: boolean('is_active').default(true).notNull(),
    storeId: text('store_id')
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    ...timestamps,
  },
  (table) => [
    unique().on(table.storeId, table.key),
    index('menus_storeId_idx').on(table.storeId),
  ],
);

export const menuItems = pgTable(
  'menu_items',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    menuId: text('menu_id')
      .notNull()
      .references(() => menus.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    name: json('name').default({}).notNull().$type<LocalizedText>(),
    description: json('description')
      .default({})
      .notNull()
      .$type<LocalizedText>(),
    imageUrl: text('image_url').default('/images/IMG_4590.jpg').notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    price: integer('price').notNull(),
    sold: integer('sold').default(0).notNull(),
    stock: integer('stock'),
    ...timestamps,
  },
  (table) => [
    unique().on(table.menuId, table.key),
    index('menu_items_menuId_idx').on(table.menuId),
  ],
);

export const menuItemOptions = pgTable(
  'menu_item_options',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    menuItemId: text('menu_item_id')
      .notNull()
      .references(() => menuItems.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    name: json('name').default({}).notNull().$type<LocalizedText>(),
    isActive: boolean('is_active').default(true).notNull(),
    multiple: boolean('multiple').default(false).notNull(),
    required: boolean('required').default(false).notNull(),
    ...timestamps,
  },
  (table) => [
    unique().on(table.menuItemId, table.key),
    index('menu_item_options_menu_itemId_idx').on(table.menuItemId),
  ],
);

export const menuItemIngredients = pgTable(
  'menu_item_ingredients',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    menuItemId: text('menu_item_id')
      .notNull()
      .references(() => menuItems.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    name: json('name').default({}).notNull().$type<LocalizedText>(),
    unit: json('unit').default({}).notNull().$type<LocalizedText>(),
    usage: doublePrecision('usage').notNull(),
    ...timestamps,
  },
  (table) => [
    unique().on(table.menuItemId, table.key),
    index('menu_item_ingredients_menu_itemId_idx').on(table.menuItemId),
  ],
);

export const menuItemOptionChoices = pgTable(
  'menu_item_option_choices',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    menuItemOptionId: text('menu_item_option_id')
      .notNull()
      .references(() => menuItemOptions.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    name: json('name').default({}).notNull().$type<LocalizedText>(),
    extraCost: integer('extra_cost').default(0).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    isShared: boolean('is_shared').default(false).notNull(),
    sold: integer('sold').default(0).notNull(),
    stock: integer('stock'),
    ...timestamps,
  },
  (table) => [
    unique().on(table.menuItemOptionId, table.key),
    index('menu_item_option_choice_optionId_idx').on(table.menuItemOptionId),
  ],
);

export const menuItemOptionChoiceIngredients = pgTable(
  'menu_item_option_choice_ingredients',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    menuItemOptionChoiceId: text('menu_item_option_choiceId')
      .notNull()
      .references(() => menuItemOptionChoices.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    name: json('name').default({}).notNull().$type<LocalizedText>(),
    unit: json('unit').default({}).notNull().$type<LocalizedText>(),
    usage: doublePrecision('usage').notNull(),
    ...timestamps,
  },
  (table) => [
    unique().on(table.menuItemOptionChoiceId, table.key),
    index('menu_item_opt_choice_ingredients_choiceId_idx').on(
      table.menuItemOptionChoiceId,
    ),
  ],
);

export const storeRelations = relations(stores, ({ many }) => ({
  menus: many(menus),
  tables: many(tables),
}));

export const tableRelations = relations(tables, ({ one }) => ({
  store: one(stores, {
    fields: [tables.storeId],
    references: [stores.id],
  }),
}));

export const menuRelations = relations(menus, ({ one, many }) => ({
  store: one(stores, {
    fields: [menus.storeId],
    references: [stores.id],
  }),
  items: many(menuItems),
}));

export const menuItemRelations = relations(menuItems, ({ one, many }) => ({
  menu: one(menus, {
    fields: [menuItems.menuId],
    references: [menus.id],
  }),
  options: many(menuItemOptions),
  ingredients: many(menuItemIngredients),
}));

export const menuItemOptionRelations = relations(
  menuItemOptions,
  ({ one, many }) => ({
    menuItem: one(menuItems, {
      fields: [menuItemOptions.menuItemId],
      references: [menuItems.id],
    }),
    choices: many(menuItemOptionChoices),
  }),
);

export const menuItemIngredientRelations = relations(
  menuItemIngredients,
  ({ one }) => ({
    menuItem: one(menuItems, {
      fields: [menuItemIngredients.menuItemId],
      references: [menuItems.id],
    }),
  }),
);

export const menuItemOptionChoiceRelations = relations(
  menuItemOptionChoices,
  ({ one, many }) => ({
    menuItemOption: one(menuItemOptions, {
      fields: [menuItemOptionChoices.menuItemOptionId],
      references: [menuItemOptions.id],
    }),
    ingredients: many(menuItemOptionChoiceIngredients),
  }),
);

export const menuItemOptionChoiceIngredientRelations = relations(
  menuItemOptionChoiceIngredients,
  ({ one }) => ({
    menuItemOptionChoice: one(menuItemOptionChoices, {
      fields: [menuItemOptionChoiceIngredients.menuItemOptionChoiceId],
      references: [menuItemOptionChoices.id],
    }),
  }),
);

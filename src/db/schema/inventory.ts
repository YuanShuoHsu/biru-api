// https://schema.org/Product
// https://schema.org/Offer
// https://schema.org/Organization
// https://schema.org/Recipe
// https://schema.org/HowToSupply

import { relations } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { timestamps } from './columns.helpers';
import { type LocalizedText } from './enums';
import { menuItem } from './menus';
import { order } from './orders';
import { organization } from './organizations';

// UN/CEFACT 代碼，對應 https://schema.org/QuantitativeValue unitCode
export const unitCodeEnum = pgEnum('unit_code', [
  'GRM',
  'KGM',
  'LTR',
  'MLT',
  'H87',
]);
export type UnitCode = (typeof unitCodeEnum.enumValues)[number];

// https://schema.org/Organization
export const supplier = pgTable(
  'supplier',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    note: text('note'),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    telephone: text('telephone'),
    url: text('url'),
    ...timestamps,
  },
  (table) => [index('supplier_organizationId_idx').on(table.organizationId)],
);

export type Supplier = typeof supplier.$inferSelect;

// https://schema.org/Product
export const ingredient = pgTable(
  'ingredient',
  {
    id: text('id').primaryKey(),
    brand: text('brand'),
    // https://schema.org/Offer 的採購規格；一個食材一組包裝與報價
    eligibleQuantity: numeric('eligible_quantity', {
      precision: 12,
      scale: 3,
    }),
    eligibleQuantityUnitCode: unitCodeEnum('eligible_quantity_unit_code'),
    image: text('image'),
    // https://schema.org/SomeProducts inventoryLevel
    inventoryLevel: numeric('inventory_level', { precision: 12, scale: 3 })
      .notNull()
      .default('0'),
    lowStockThreshold: numeric('low_stock_threshold', {
      precision: 12,
      scale: 3,
    }),
    name: jsonb('name').notNull().$type<LocalizedText>(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    price: numeric('price', { precision: 10, scale: 2 }),
    priceCurrency: text('price_currency').notNull().default('TWD'),
    sortOrder: integer('sort_order').notNull().default(0),
    supplierId: text('supplier_id').references(() => supplier.id, {
      onDelete: 'set null',
    }),
    unitCode: unitCodeEnum('unit_code').notNull(),
    url: text('url'),
    ...timestamps,
  },
  (table) => [
    index('ingredient_organizationId_idx').on(table.organizationId),
    index('ingredient_supplierId_idx').on(table.supplierId),
  ],
);

export type Ingredient = typeof ingredient.$inferSelect;

export const inventoryTransaction = pgTable(
  'inventory_transaction',
  {
    id: text('id').primaryKey(),
    ingredientId: text('ingredient_id')
      .notNull()
      .references(() => ingredient.id, { onDelete: 'cascade' }),
    note: text('note'),
    orderId: text('order_id').references(() => order.id, {
      onDelete: 'set null',
    }),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull(),
    unitCost: numeric('unit_cost', { precision: 16, scale: 6 }),
    ...timestamps,
  },
  (table) => [
    index('inventoryTransaction_ingredientId_idx').on(table.ingredientId),
    index('inventoryTransaction_organizationId_idx').on(table.organizationId),
    index('inventoryTransaction_orderId_idx').on(table.orderId),
  ],
);

export type InventoryTransaction = typeof inventoryTransaction.$inferSelect;

// https://schema.org/Recipe
export const recipe = pgTable(
  'recipe',
  {
    id: text('id').primaryKey(),
    menuItemId: text('menu_item_id').references(() => menuItem.id, {
      onDelete: 'set null',
    }),
    name: jsonb('name').notNull().$type<LocalizedText>(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    recipeInstructions: jsonb('recipe_instructions').$type<LocalizedText[]>(),
    recipeYield: integer('recipe_yield').notNull().default(1),
    ...timestamps,
  },
  (table) => [
    index('recipe_organizationId_idx').on(table.organizationId),
    uniqueIndex('recipe_menuItemId_uidx').on(table.menuItemId),
  ],
);

export type Recipe = typeof recipe.$inferSelect;

// https://schema.org/HowToSupply
export const recipeIngredient = pgTable(
  'recipe_ingredient',
  {
    id: text('id').primaryKey(),
    ingredientId: text('ingredient_id')
      .notNull()
      .references(() => ingredient.id, { onDelete: 'restrict' }),
    recipeId: text('recipe_id')
      .notNull()
      .references(() => recipe.id, { onDelete: 'cascade' }),
    requiredQuantity: numeric('required_quantity', {
      precision: 12,
      scale: 3,
    }).notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (table) => [
    index('recipeIngredient_ingredientId_idx').on(table.ingredientId),
    index('recipeIngredient_recipeId_idx').on(table.recipeId),
    uniqueIndex('recipeIngredient_recipeId_ingredientId_uidx').on(
      table.recipeId,
      table.ingredientId,
    ),
  ],
);

export type RecipeIngredient = typeof recipeIngredient.$inferSelect;

export const supplierRelations = relations(supplier, ({ one, many }) => ({
  organization: one(organization, {
    fields: [supplier.organizationId],
    references: [organization.id],
  }),
  ingredients: many(ingredient),
}));

export const ingredientRelations = relations(ingredient, ({ one, many }) => ({
  organization: one(organization, {
    fields: [ingredient.organizationId],
    references: [organization.id],
  }),
  inventoryTransactions: many(inventoryTransaction),
  supplier: one(supplier, {
    fields: [ingredient.supplierId],
    references: [supplier.id],
  }),
  recipeIngredients: many(recipeIngredient),
}));

export const inventoryTransactionRelations = relations(
  inventoryTransaction,
  ({ one }) => ({
    ingredient: one(ingredient, {
      fields: [inventoryTransaction.ingredientId],
      references: [ingredient.id],
    }),
    order: one(order, {
      fields: [inventoryTransaction.orderId],
      references: [order.id],
    }),
    organization: one(organization, {
      fields: [inventoryTransaction.organizationId],
      references: [organization.id],
    }),
  }),
);

export const recipeRelations = relations(recipe, ({ one, many }) => ({
  menuItem: one(menuItem, {
    fields: [recipe.menuItemId],
    references: [menuItem.id],
  }),
  organization: one(organization, {
    fields: [recipe.organizationId],
    references: [organization.id],
  }),
  recipeIngredients: many(recipeIngredient),
}));

export const recipeIngredientRelations = relations(
  recipeIngredient,
  ({ one }) => ({
    ingredient: one(ingredient, {
      fields: [recipeIngredient.ingredientId],
      references: [ingredient.id],
    }),
    recipe: one(recipe, {
      fields: [recipeIngredient.recipeId],
      references: [recipe.id],
    }),
  }),
);

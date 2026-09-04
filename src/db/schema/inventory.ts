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

export const inventoryTransactionTypeEnum = pgEnum(
  'inventory_transaction_type',
  ['purchase', 'consumption', 'adjustment', 'waste', 'restoration'],
);
export type InventoryTransactionType =
  (typeof inventoryTransactionTypeEnum.enumValues)[number];

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
    unitCode: unitCodeEnum('unit_code').notNull(),
    ...timestamps,
  },
  (table) => [index('ingredient_organizationId_idx').on(table.organizationId)],
);

export type Ingredient = typeof ingredient.$inferSelect;

// https://schema.org/Offer
export const ingredientOffer = pgTable(
  'ingredient_offer',
  {
    id: text('id').primaryKey(),
    eligibleQuantity: numeric('eligible_quantity', {
      precision: 12,
      scale: 3,
    }).notNull(),
    eligibleQuantityUnitCode: unitCodeEnum(
      'eligible_quantity_unit_code',
    ).notNull(),
    ingredientId: text('ingredient_id')
      .notNull()
      .references(() => ingredient.id, { onDelete: 'cascade' }),
    price: numeric('price', { precision: 10, scale: 2 }).notNull(),
    priceCurrency: text('price_currency').notNull().default('TWD'),
    sortOrder: integer('sort_order').notNull().default(0),
    supplierId: text('supplier_id').references(() => supplier.id, {
      onDelete: 'set null',
    }),
    url: text('url'),
    ...timestamps,
  },
  (table) => [
    index('ingredientOffer_ingredientId_idx').on(table.ingredientId),
    index('ingredientOffer_supplierId_idx').on(table.supplierId),
  ],
);

export type IngredientOffer = typeof ingredientOffer.$inferSelect;

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
    type: inventoryTransactionTypeEnum('type').notNull(),
    unitCost: numeric('unit_cost', { precision: 10, scale: 4 }),
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
  ],
);

export type RecipeIngredient = typeof recipeIngredient.$inferSelect;

export const supplierRelations = relations(supplier, ({ one, many }) => ({
  organization: one(organization, {
    fields: [supplier.organizationId],
    references: [organization.id],
  }),
  ingredientOffers: many(ingredientOffer),
}));

export const ingredientRelations = relations(ingredient, ({ one, many }) => ({
  organization: one(organization, {
    fields: [ingredient.organizationId],
    references: [organization.id],
  }),
  offers: many(ingredientOffer),
  inventoryTransactions: many(inventoryTransaction),
  recipeIngredients: many(recipeIngredient),
}));

export const ingredientOfferRelations = relations(
  ingredientOffer,
  ({ one }) => ({
    ingredient: one(ingredient, {
      fields: [ingredientOffer.ingredientId],
      references: [ingredient.id],
    }),
    supplier: one(supplier, {
      fields: [ingredientOffer.supplierId],
      references: [supplier.id],
    }),
  }),
);

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

import { relations, sql } from 'drizzle-orm';
import {
  AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { timestamps } from './columns.helpers.js';
import {
  restrictedDietEnum,
  servingTemperatureEnum,
  servingTemperatureLevelEnum,
  sweetnessEnum,
  sweetnessLevelEnum,
  type LocalizedText,
} from './enums.js';
import type { NutritionInformation, PriceSpecification } from './menus.js';
import { organization } from './organizations.js';

// https://schema.org/MenuSection
export const catalogSection = pgTable(
  'catalog_section',
  {
    id: text('id').primaryKey(),
    ownerOrganizationId: text('owner_organization_id').references(
      () => organization.id,
      { onDelete: 'cascade' },
    ),
    parentCatalogSectionId: text('parent_catalog_section_id').references(
      (): AnyPgColumn => catalogSection.id,
      { onDelete: 'cascade' },
    ),
    name: jsonb('name').notNull().$type<LocalizedText>(),
    description: jsonb('description').$type<LocalizedText>(),
    image: text('image'),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (table) => [
    index('catalogSection_ownerOrganizationId_idx').on(
      table.ownerOrganizationId,
    ),
    index('catalogSection_parentCatalogSectionId_idx').on(
      table.parentCatalogSectionId,
    ),
  ],
);

export type CatalogSection = typeof catalogSection.$inferSelect;

// https://schema.org/MenuItem
export const catalogItem = pgTable(
  'catalog_item',
  {
    id: text('id').primaryKey(),
    ownerOrganizationId: text('owner_organization_id').references(
      () => organization.id,
      { onDelete: 'cascade' },
    ),
    catalogSectionId: text('catalog_section_id').references(
      () => catalogSection.id,
      { onDelete: 'cascade' },
    ),
    name: jsonb('name').notNull().$type<LocalizedText>(),
    description: jsonb('description').$type<LocalizedText>(),
    image: text('image'),
    suitableForDiet: restrictedDietEnum('suitable_for_diet').array(),
    // 可供應的溫度；空陣列代表不適用（如餐點）
    servingTemperatures: servingTemperatureEnum('serving_temperatures')
      .array()
      .notNull()
      .default([]),
    // 推薦的溫度細項，須屬於可供應的冷熱；只在點餐時標示，不自動帶入
    recommendedServingTemperatureLevel: servingTemperatureLevelEnum(
      'recommended_serving_temperature_level',
    ),
    sweetness: sweetnessEnum('sweetness').notNull().default('NotApplicable'),
    // 甜度固定時的等級；其他情況為 null
    fixedSweetnessLevel: sweetnessLevelEnum('fixed_sweetness_level'),
    // 推薦的甜度，僅甜度可調時可設；只在點餐時標示，不自動帶入
    recommendedSweetnessLevel: sweetnessLevelEnum(
      'recommended_sweetness_level',
    ),
    nutrition: jsonb('nutrition').$type<NutritionInformation>(),
    suggestedPrice: numeric('suggested_price', { precision: 10, scale: 2 }),
    priceSpecification: jsonb(
      'price_specification',
    ).$type<PriceSpecification>(),
    discontinued: boolean('discontinued').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (table) => [
    index('catalogItem_ownerOrganizationId_idx').on(table.ownerOrganizationId),
    index('catalogItem_catalogSectionId_idx').on(table.catalogSectionId),
    check(
      'catalogItem_fixed_sweetness_level',
      sql`(${table.sweetness} = 'Fixed') = (${table.fixedSweetnessLevel} IS NOT NULL)`,
    ),
    check(
      'catalogItem_recommended_sweetness_level',
      sql`${table.recommendedSweetnessLevel} IS NULL OR ${table.sweetness} = 'Adjustable'`,
    ),
  ],
);

export type CatalogItem = typeof catalogItem.$inferSelect;

// https://schema.org/MenuItem menuAddOn property
export const catalogItemAddOn = pgTable(
  'catalog_item_add_on',
  {
    id: text('id').primaryKey(),
    catalogItemId: text('catalog_item_id')
      .notNull()
      .references(() => catalogItem.id, { onDelete: 'cascade' }),
    addOnCatalogItemId: text('add_on_catalog_item_id').references(
      () => catalogItem.id,
      { onDelete: 'cascade' },
    ),
    addOnCatalogSectionId: text('add_on_catalog_section_id').references(
      () => catalogSection.id,
      { onDelete: 'cascade' },
    ),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (table) => [
    index('catalogItemAddOn_catalogItemId_idx').on(table.catalogItemId),
    index('catalogItemAddOn_addOnCatalogItemId_idx').on(
      table.addOnCatalogItemId,
    ),
    index('catalogItemAddOn_addOnCatalogSectionId_idx').on(
      table.addOnCatalogSectionId,
    ),
  ],
);

export type CatalogItemAddOn = typeof catalogItemAddOn.$inferSelect;

// https://docs.cloud.google.com/food-ai/reference/rest/v1beta/projects.locations.menus#ModifierGroup
export const catalogModifierGroup = pgTable(
  'catalog_modifier_group',
  {
    id: text('id').primaryKey(),
    ownerOrganizationId: text('owner_organization_id').references(
      () => organization.id,
      { onDelete: 'cascade' },
    ),
    displayName: jsonb('display_name').notNull().$type<LocalizedText>(),
    minSelectionCount: integer('min_selection_count').notNull().default(0),
    maxSelectionCount: integer('max_selection_count'),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (table) => [
    index('catalogModifierGroup_ownerOrganizationId_idx').on(
      table.ownerOrganizationId,
    ),
  ],
);

export type CatalogModifierGroup = typeof catalogModifierGroup.$inferSelect;

// https://docs.cloud.google.com/food-ai/reference/rest/v1beta/projects.locations.menus#Modifier
export const catalogModifier = pgTable(
  'catalog_modifier',
  {
    id: text('id').primaryKey(),
    catalogModifierGroupId: text('catalog_modifier_group_id')
      .notNull()
      .references(() => catalogModifierGroup.id, { onDelete: 'cascade' }),
    displayName: jsonb('display_name').notNull().$type<LocalizedText>(),
    image: text('image'),
    priceAdjustment: numeric('price_adjustment', { precision: 10, scale: 2 }),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (table) => [
    index('catalogModifier_catalogModifierGroupId_idx').on(
      table.catalogModifierGroupId,
    ),
  ],
);

export type CatalogModifier = typeof catalogModifier.$inferSelect;

// https://docs.cloud.google.com/food-ai/reference/rest/v1beta/projects.locations.menus#Item
export const catalogItemModifierGroup = pgTable(
  'catalog_item_modifier_group',
  {
    id: text('id').primaryKey(),
    catalogItemId: text('catalog_item_id')
      .notNull()
      .references(() => catalogItem.id, { onDelete: 'cascade' }),
    catalogModifierGroupId: text('catalog_modifier_group_id')
      .notNull()
      .references(() => catalogModifierGroup.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (table) => [
    index('catalogItemModifierGroup_catalogItemId_idx').on(table.catalogItemId),
    index('catalogItemModifierGroup_catalogModifierGroupId_idx').on(
      table.catalogModifierGroupId,
    ),
    uniqueIndex(
      'catalogItemModifierGroup_catalogItemId_catalogModifierGroupId_uidx',
    ).on(table.catalogItemId, table.catalogModifierGroupId),
  ],
);

export type CatalogItemModifierGroup =
  typeof catalogItemModifierGroup.$inferSelect;

export const catalogSectionRelations = relations(
  catalogSection,
  ({ one, many }) => ({
    ownerOrganization: one(organization, {
      fields: [catalogSection.ownerOrganizationId],
      references: [organization.id],
    }),
    parentCatalogSection: one(catalogSection, {
      fields: [catalogSection.parentCatalogSectionId],
      references: [catalogSection.id],
      relationName: 'parentCatalogSection',
    }),
    subSections: many(catalogSection, {
      relationName: 'parentCatalogSection',
    }),
    catalogItems: many(catalogItem),
  }),
);

export const catalogItemRelations = relations(catalogItem, ({ one, many }) => ({
  ownerOrganization: one(organization, {
    fields: [catalogItem.ownerOrganizationId],
    references: [organization.id],
  }),
  catalogSection: one(catalogSection, {
    fields: [catalogItem.catalogSectionId],
    references: [catalogSection.id],
  }),
  addOns: many(catalogItemAddOn, { relationName: 'catalogItemAddOns' }),
  modifierGroups: many(catalogItemModifierGroup),
}));

export const catalogItemAddOnRelations = relations(
  catalogItemAddOn,
  ({ one }) => ({
    catalogItem: one(catalogItem, {
      fields: [catalogItemAddOn.catalogItemId],
      references: [catalogItem.id],
      relationName: 'catalogItemAddOns',
    }),
    addOnCatalogItem: one(catalogItem, {
      fields: [catalogItemAddOn.addOnCatalogItemId],
      references: [catalogItem.id],
    }),
    addOnCatalogSection: one(catalogSection, {
      fields: [catalogItemAddOn.addOnCatalogSectionId],
      references: [catalogSection.id],
    }),
  }),
);

export const catalogModifierGroupRelations = relations(
  catalogModifierGroup,
  ({ one, many }) => ({
    ownerOrganization: one(organization, {
      fields: [catalogModifierGroup.ownerOrganizationId],
      references: [organization.id],
    }),
    modifiers: many(catalogModifier),
    catalogItems: many(catalogItemModifierGroup),
  }),
);

export const catalogModifierRelations = relations(
  catalogModifier,
  ({ one }) => ({
    catalogModifierGroup: one(catalogModifierGroup, {
      fields: [catalogModifier.catalogModifierGroupId],
      references: [catalogModifierGroup.id],
    }),
  }),
);

export const catalogItemModifierGroupRelations = relations(
  catalogItemModifierGroup,
  ({ one }) => ({
    catalogItem: one(catalogItem, {
      fields: [catalogItemModifierGroup.catalogItemId],
      references: [catalogItem.id],
    }),
    catalogModifierGroup: one(catalogModifierGroup, {
      fields: [catalogItemModifierGroup.catalogModifierGroupId],
      references: [catalogModifierGroup.id],
    }),
  }),
);

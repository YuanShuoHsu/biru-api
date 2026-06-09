// https://schema.org/Menu
// https://schema.org/MenuSection
// https://schema.org/MenuItem
// https://schema.org/Offer
// https://schema.org/NutritionInformation

import { relations } from 'drizzle-orm';
import {
  AnyPgColumn,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  unique,
} from 'drizzle-orm/pg-core';

import { timestamps } from './columns.helpers';
import { type LocalizedText } from './enums';
import { organization } from './organizations';

// https://schema.org/RestrictedDiet
export const restrictedDietEnum = pgEnum('restricted_diet', [
  'DiabeticDiet',
  'GlutenFreeDiet',
  'HalalDiet',
  'HinduDiet',
  'KosherDiet',
  'LowCalorieDiet',
  'LowFatDiet',
  'LowLactoseDiet',
  'LowSaltDiet',
  'VeganDiet',
  'VegetarianDiet',
]);
export type RestrictedDiet = (typeof restrictedDietEnum.enumValues)[number];

// https://schema.org/ItemAvailability
export const itemAvailabilityEnum = pgEnum('item_availability', [
  'InStock',
  'SoldOut',
  'Discontinued',
]);
export type ItemAvailability = (typeof itemAvailabilityEnum.enumValues)[number];

// https://schema.org/Menu
export const menu = pgTable(
  'menu',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    name: jsonb('name').notNull().$type<LocalizedText>(),
    description: jsonb('description').$type<LocalizedText>(),
    image: text('image'),
    ...timestamps,
  },
  (table) => [
    index('menu_organizationId_idx').on(table.organizationId),
    unique('menu_organizationId_unique').on(table.organizationId),
  ],
);

export type Menu = typeof menu.$inferSelect;

// https://schema.org/MenuSection
export const menuSection = pgTable(
  'menu_section',
  {
    id: text('id').primaryKey(),
    menuId: text('menu_id').references(() => menu.id, { onDelete: 'cascade' }),
    parentSectionId: text('parent_section_id').references(
      (): AnyPgColumn => menuSection.id,
      { onDelete: 'cascade' },
    ),
    name: jsonb('name').notNull().$type<LocalizedText>(),
    description: jsonb('description').$type<LocalizedText>(),
    image: text('image'),
    // additional fields
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (table) => [
    index('menuSection_menuId_idx').on(table.menuId),
    index('menuSection_parentSectionId_idx').on(table.parentSectionId),
  ],
);

export type MenuSection = typeof menuSection.$inferSelect;

// https://schema.org/NutritionInformation
export interface NutritionInformation {
  calories?: string;
  carbohydrateContent?: string;
  cholesterolContent?: string;
  fatContent?: string;
  fiberContent?: string;
  proteinContent?: string;
  saturatedFatContent?: string;
  servingSize?: string;
  sodiumContent?: string;
  sugarContent?: string;
  transFatContent?: string;
  unsaturatedFatContent?: string;
}

// https://schema.org/MenuItem
export const menuItem = pgTable(
  'menu_item',
  {
    id: text('id').primaryKey(),
    menuId: text('menu_id').references(() => menu.id, { onDelete: 'cascade' }),
    menuSectionId: text('menu_section_id').references(() => menuSection.id, {
      onDelete: 'cascade',
    }),
    name: jsonb('name').notNull().$type<LocalizedText>(),
    description: jsonb('description').$type<LocalizedText>(),
    image: text('image'),
    suitableForDiet: restrictedDietEnum('suitable_for_diet').array(),
    nutrition: jsonb('nutrition').$type<NutritionInformation>(),
    // additional fields
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (table) => [
    index('menuItem_menuId_idx').on(table.menuId),
    index('menuItem_menuSectionId_idx').on(table.menuSectionId),
  ],
);

export type MenuItem = typeof menuItem.$inferSelect;

// https://schema.org/QuantitativeValue
export interface QuantitativeValue {
  unitText?: string;
  value?: number;
}

// https://schema.org/PriceSpecification
export interface PriceSpecification {
  price: string;
  priceCurrency: string;
  validFrom?: string;
  validThrough?: string;
}

// https://schema.org/Offer
export const offer = pgTable(
  'offer',
  {
    id: text('id').primaryKey(),
    menuItemId: text('menu_item_id').references(() => menuItem.id, {
      onDelete: 'cascade',
    }),
    menuSectionId: text('menu_section_id').references(() => menuSection.id, {
      onDelete: 'cascade',
    }),
    price: numeric('price', { precision: 10, scale: 2 }),
    priceCurrency: text('price_currency').default('TWD'),
    availability: itemAvailabilityEnum('availability').default('InStock'),
    deliveryLeadTime: jsonb('delivery_lead_time').$type<QuantitativeValue>(),
    inventoryLevel: jsonb('inventory_level').$type<QuantitativeValue>(),
    priceSpecification: jsonb(
      'price_specification',
    ).$type<PriceSpecification>(),
    ...timestamps,
  },
  (table) => [
    index('offer_menuItemId_idx').on(table.menuItemId),
    index('offer_menuSectionId_idx').on(table.menuSectionId),
  ],
);

export type Offer = typeof offer.$inferSelect;

// https://schema.org/MenuItem menuAddOn property
export const menuItemAddOn = pgTable(
  'menu_item_add_on',
  {
    id: text('id').primaryKey(),
    menuItemId: text('menu_item_id')
      .notNull()
      .references(() => menuItem.id, { onDelete: 'cascade' }),
    addOnMenuItemId: text('add_on_menu_item_id').references(() => menuItem.id, {
      onDelete: 'cascade',
    }),
    addOnMenuSectionId: text('add_on_menu_section_id').references(
      () => menuSection.id,
      { onDelete: 'cascade' },
    ),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (table) => [
    index('menuItemAddOn_menuItemId_idx').on(table.menuItemId),
    index('menuItemAddOn_addOnMenuItemId_idx').on(table.addOnMenuItemId),
    index('menuItemAddOn_addOnMenuSectionId_idx').on(table.addOnMenuSectionId),
  ],
);

export type MenuItemAddOn = typeof menuItemAddOn.$inferSelect;

// https://docs.cloud.google.com/food-ai/reference/rest/v1beta/projects.locations.menus#ModifierGroup
export const modifierGroup = pgTable(
  'modifier_group',
  {
    id: text('id').primaryKey(),
    menuId: text('menu_id').references(() => menu.id, { onDelete: 'cascade' }),
    displayName: jsonb('display_name').notNull().$type<LocalizedText>(),
    minSelectionCount: integer('min_selection_count').notNull().default(0),
    maxSelectionCount: integer('max_selection_count'),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (table) => [index('modifierGroup_menuId_idx').on(table.menuId)],
);

export type ModifierGroup = typeof modifierGroup.$inferSelect;

// https://docs.cloud.google.com/food-ai/reference/rest/v1beta/projects.locations.menus#Modifier
export const modifier = pgTable(
  'modifier',
  {
    id: text('id').primaryKey(),
    modifierGroupId: text('modifier_group_id')
      .notNull()
      .references(() => modifierGroup.id, { onDelete: 'cascade' }),
    displayName: jsonb('display_name').notNull().$type<LocalizedText>(),
    priceAdjustment: numeric('price_adjustment', { precision: 10, scale: 2 }),
    availability: itemAvailabilityEnum('availability').default('InStock'),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (table) => [index('modifier_modifierGroupId_idx').on(table.modifierGroupId)],
);

export type Modifier = typeof modifier.$inferSelect;

// https://docs.cloud.google.com/food-ai/reference/rest/v1beta/projects.locations.menus#Item
export const menuItemModifierGroup = pgTable(
  'menu_item_modifier_group',
  {
    id: text('id').primaryKey(),
    menuItemId: text('menu_item_id')
      .notNull()
      .references(() => menuItem.id, { onDelete: 'cascade' }),
    modifierGroupId: text('modifier_group_id')
      .notNull()
      .references(() => modifierGroup.id, { onDelete: 'cascade' }),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (table) => [
    index('menuItemModifierGroup_menuItemId_idx').on(table.menuItemId),
    index('menuItemModifierGroup_modifierGroupId_idx').on(
      table.modifierGroupId,
    ),
  ],
);

export type MenuItemModifierGroup = typeof menuItemModifierGroup.$inferSelect;

export const menuRelations = relations(menu, ({ one, many }) => ({
  organization: one(organization, {
    fields: [menu.organizationId],
    references: [organization.id],
  }),
  menuSections: many(menuSection),
  menuItems: many(menuItem),
  modifierGroups: many(modifierGroup),
}));

export const menuSectionRelations = relations(menuSection, ({ one, many }) => ({
  menu: one(menu, {
    fields: [menuSection.menuId],
    references: [menu.id],
  }),
  parentSection: one(menuSection, {
    fields: [menuSection.parentSectionId],
    references: [menuSection.id],
    relationName: 'parentSection',
  }),
  subSections: many(menuSection, { relationName: 'parentSection' }),
  menuItems: many(menuItem),
  offers: many(offer),
}));

export const menuItemRelations = relations(menuItem, ({ one, many }) => ({
  menu: one(menu, {
    fields: [menuItem.menuId],
    references: [menu.id],
  }),
  menuSection: one(menuSection, {
    fields: [menuItem.menuSectionId],
    references: [menuSection.id],
  }),
  offers: many(offer),
  addOns: many(menuItemAddOn, { relationName: 'menuItemAddOns' }),
  modifierGroups: many(menuItemModifierGroup),
}));

export const offerRelations = relations(offer, ({ one }) => ({
  menuItem: one(menuItem, {
    fields: [offer.menuItemId],
    references: [menuItem.id],
  }),
  menuSection: one(menuSection, {
    fields: [offer.menuSectionId],
    references: [menuSection.id],
  }),
}));

export const menuItemAddOnRelations = relations(menuItemAddOn, ({ one }) => ({
  menuItem: one(menuItem, {
    fields: [menuItemAddOn.menuItemId],
    references: [menuItem.id],
    relationName: 'menuItemAddOns',
  }),
  addOnMenuItem: one(menuItem, {
    fields: [menuItemAddOn.addOnMenuItemId],
    references: [menuItem.id],
  }),
  addOnMenuSection: one(menuSection, {
    fields: [menuItemAddOn.addOnMenuSectionId],
    references: [menuSection.id],
  }),
}));

export const modifierGroupRelations = relations(
  modifierGroup,
  ({ one, many }) => ({
    menu: one(menu, {
      fields: [modifierGroup.menuId],
      references: [menu.id],
    }),
    modifiers: many(modifier),
    menuItems: many(menuItemModifierGroup),
  }),
);

export const modifierRelations = relations(modifier, ({ one }) => ({
  modifierGroup: one(modifierGroup, {
    fields: [modifier.modifierGroupId],
    references: [modifierGroup.id],
  }),
}));

export const menuItemModifierGroupRelations = relations(
  menuItemModifierGroup,
  ({ one }) => ({
    menuItem: one(menuItem, {
      fields: [menuItemModifierGroup.menuItemId],
      references: [menuItem.id],
    }),
    modifierGroup: one(modifierGroup, {
      fields: [menuItemModifierGroup.modifierGroupId],
      references: [modifierGroup.id],
    }),
  }),
);

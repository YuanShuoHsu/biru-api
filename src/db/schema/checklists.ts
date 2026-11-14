import { relations, sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { organization } from './organizations.js';
import { user } from './users.js';

export const checklistTimingEnum = pgEnum('checklist_timing', [
  'opening',
  'closing',
  'anytime',
]);
export type ChecklistTiming = (typeof checklistTimingEnum.enumValues)[number];

export const checklistItemTypeEnum = pgEnum('checklist_item_type', [
  'check',
  'number',
]);
export type ChecklistItemType =
  (typeof checklistItemTypeEnum.enumValues)[number];

const measurement = (name: string) =>
  numeric(name, { mode: 'number', precision: 8, scale: 2 });

export const checklistTemplate = pgTable(
  'checklist_template',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    timing: checklistTimingEnum('timing').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index('checklist_template_organization_idx').on(t.organizationId)],
);

export const checklistTemplateItem = pgTable(
  'checklist_template_item',
  {
    id: text('id').primaryKey(),
    templateId: text('template_id')
      .notNull()
      .references(() => checklistTemplate.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    type: checklistItemTypeEnum('type').notNull(),
    unit: text('unit'),
    minValue: measurement('min_value'),
    maxValue: measurement('max_value'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [
    index('checklist_template_item_template_idx').on(t.templateId),
    check(
      'checklist_template_item_range',
      sql`${t.minValue} IS NULL OR ${t.maxValue} IS NULL OR ${t.minValue} <= ${t.maxValue}`,
    ),
  ],
);

export type ChecklistItemSnapshot = Pick<
  typeof checklistTemplateItem.$inferSelect,
  'id' | 'label' | 'type' | 'unit' | 'minValue' | 'maxValue'
>;

export type ChecklistTemplateSnapshot = Pick<
  typeof checklistTemplate.$inferSelect,
  'name' | 'timing'
> & { items: ChecklistItemSnapshot[] };

export const checklistRun = pgTable(
  'checklist_run',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'restrict' }),
    templateId: text('template_id').references(() => checklistTemplate.id, {
      onDelete: 'set null',
    }),
    businessDate: date('business_date').notNull(),
    templateSnapshot: jsonb('template_snapshot')
      .$type<ChecklistTemplateSnapshot>()
      .notNull(),
    startedAt: timestamp('started_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('checklist_run_template_date_uidx').on(
      t.organizationId,
      t.templateId,
      t.businessDate,
    ),
    index('checklist_run_organization_date_idx').on(
      t.organizationId,
      t.businessDate,
    ),
    index('checklist_run_template_idx').on(t.templateId),
  ],
);

export const checklistRunItem = pgTable(
  'checklist_run_item',
  {
    id: text('id').primaryKey(),
    runId: text('run_id')
      .notNull()
      .references(() => checklistRun.id, { onDelete: 'cascade' }),
    itemId: text('item_id').notNull(),
    itemSnapshot: jsonb('item_snapshot')
      .$type<ChecklistItemSnapshot>()
      .notNull(),
    checked: boolean('checked'),
    value: measurement('value'),
    outOfRange: boolean('out_of_range').notNull().default(false),
    actionNote: text('action_note'),
    filledBy: text('filled_by').references(() => user.id, {
      onDelete: 'set null',
    }),
    filledByName: text('filled_by_name').notNull(),
    filledAt: timestamp('filled_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex('checklist_run_item_run_item_uidx').on(t.runId, t.itemId),
    index('checklist_run_item_filled_by_idx').on(t.filledBy),
  ],
);

export const checklistSetting = pgTable('checklist_setting', {
  organizationId: text('organization_id')
    .primaryKey()
    .references(() => organization.id, { onDelete: 'cascade' }),
  defaultTemplatesCreatedAt: timestamp('default_templates_created_at', {
    withTimezone: true,
  }),
});

export const checklistTemplateRelations = relations(
  checklistTemplate,
  ({ many }) => ({ items: many(checklistTemplateItem) }),
);

export const checklistTemplateItemRelations = relations(
  checklistTemplateItem,
  ({ one }) => ({
    template: one(checklistTemplate, {
      fields: [checklistTemplateItem.templateId],
      references: [checklistTemplate.id],
    }),
  }),
);

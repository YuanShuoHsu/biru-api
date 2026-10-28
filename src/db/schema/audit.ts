import { relations } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

import { type LocalizedText } from './enums.js';
import { organization } from './organizations.js';
import { user } from './users.js';

export const auditResourceEnum = pgEnum('audit_resource', [
  'menu',
  'menuSection',
  'menuItem',
  'menuItemAddOn',
  'modifierGroup',
  'modifier',
  'menuItemModifierGroup',
  'order',
  'userCoupon',
  'coupon',
  'banner',
  'invoice',
  'supplier',
  'ingredient',
  'recipe',
  'organization',
  'waitlistTicket',
  'member',
  'invitation',
  'user',
  'team',
  'pointTransaction',
  'pointSetting',
  'storePhoto',
]);
export type AuditResource = (typeof auditResourceEnum.enumValues)[number];

export const auditActionEnum = pgEnum('audit_action', [
  'create',
  'update',
  'delete',
]);
export type AuditAction = (typeof auditActionEnum.enumValues)[number];

export type AuditChanges = Record<string, { before: unknown; after: unknown }>;

export type AuditResourceLabel = LocalizedText | string;

export type AuditChangeLabels = Record<
  string,
  Record<string, AuditResourceLabel>
>;

export const auditLog = pgTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    // 刻意不設外鍵：記錄的是當時的操作者，帳號刪除後保留原 id，帳號還原時自動接回
    actorId: text('actor_id'),
    actorName: text('actor_name').notNull(),
    actorEmail: text('actor_email').notNull(),
    organizationId: text('organization_id').references(() => organization.id, {
      onDelete: 'cascade',
    }),
    resource: auditResourceEnum('resource').notNull(),
    resourceId: text('resource_id').notNull(),
    resourceLabel: jsonb('resource_label').$type<AuditResourceLabel>(),
    ancestorIds: text('ancestor_ids').array(),
    action: auditActionEnum('action').notNull(),
    changes: jsonb('changes').$type<AuditChanges>().notNull(),
    changeLabels: jsonb('change_labels').$type<AuditChangeLabels>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('auditLog_organizationId_createdAt_idx').on(
      table.organizationId,
      table.createdAt,
    ),
    index('auditLog_resource_resourceId_createdAt_idx').on(
      table.resource,
      table.resourceId,
      table.createdAt,
    ),
    index('auditLog_actorId_idx').on(table.actorId),
  ],
);

export type AuditLog = typeof auditLog.$inferSelect;

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  actor: one(user, {
    fields: [auditLog.actorId],
    references: [user.id],
  }),
  organization: one(organization, {
    fields: [auditLog.organizationId],
    references: [organization.id],
  }),
}));

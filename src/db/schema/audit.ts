import { relations } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

import { organization } from './organizations';
import { user } from './users';

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
]);
export type AuditResource = (typeof auditResourceEnum.enumValues)[number];

export const auditActionEnum = pgEnum('audit_action', [
  'create',
  'update',
  'delete',
]);
export type AuditAction = (typeof auditActionEnum.enumValues)[number];

export type AuditChanges = Record<string, { before: unknown; after: unknown }>;

export const auditLog = pgTable(
  'audit_log',
  {
    id: text('id').primaryKey(),
    actorId: text('actor_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    actorName: text('actor_name').notNull(),
    actorEmail: text('actor_email').notNull(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organization.id, { onDelete: 'cascade' }),
    resource: auditResourceEnum('resource').notNull(),
    resourceId: text('resource_id').notNull(),
    action: auditActionEnum('action').notNull(),
    changes: jsonb('changes').$type<AuditChanges>().notNull(),
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

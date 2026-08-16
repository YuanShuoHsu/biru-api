import { relations } from 'drizzle-orm';
import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

import { type LocalizedText } from './enums';
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

// 多語名稱存物件、單語識別（訂單編號）存字串
export type AuditResourceLabel = LocalizedText | string;

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
    // 寫入當下的名稱快照。不能改成查詢時 join 回原表：刪除紀錄的對象已經不存在，
    // 而那正是最需要看名字的一列
    resourceLabel: jsonb('resource_label').$type<AuditResourceLabel>(),
    // 由根到父的 id，讓前端拼得出巢狀路由（品項加購要 sectionId + menuItemId）。
    // 存的是當下的歸屬，之後品項被搬到別的分類也不會改寫這筆
    ancestorIds: text('ancestor_ids').array(),
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

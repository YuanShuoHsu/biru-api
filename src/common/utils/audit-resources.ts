import { getTableColumns, getTableName, inArray } from 'drizzle-orm';
import type { AnyPgTable, PgColumn } from 'drizzle-orm/pg-core';

import type {
  AuditChangeLabels,
  AuditChanges,
  AuditResource,
  AuditResourceLabel,
} from '../../db/schema/audit.js';
import { banner } from '../../db/schema/banners.js';
import { coupon, userCoupon } from '../../db/schema/coupons.js';
import {
  ingredient,
  recipe,
  recipeIngredient,
  supplier,
} from '../../db/schema/inventory.js';
import { invoice } from '../../db/schema/invoices.js';
import {
  menu,
  menuItem,
  menuItemAddOn,
  menuItemModifierGroup,
  menuSection,
  modifier,
  modifierGroup,
  offer,
} from '../../db/schema/menus.js';
import { order } from '../../db/schema/orders.js';
import {
  invitation,
  member,
  organization,
  organizationQrSecret,
  organizationSpecialHours,
  team,
} from '../../db/schema/organizations.js';
import { pointSetting, pointTransaction } from '../../db/schema/points.js';
import { printer } from '../../db/schema/printers.js';
import { refund } from '../../db/schema/refunds.js';
import { storeLayout } from '../../db/schema/store-layout.js';
import { storePhoto } from '../../db/schema/store-photos.js';
import { user } from '../../db/schema/users.js';
import { waitlistSetting, waitlistTicket } from '../../db/schema/waitlist.js';
import type { DrizzleDB } from '../../drizzle/drizzle.module.js';

import { formatTicketNumber } from '../../waitlist/waitlist-rules.js';

import type { AuditSubTable } from '../decorators/audit.decorator.js';

type Row = Record<string, unknown>;

export type AuditableTable = AnyPgTable & { id: PgColumn };

export type AuditLabelScope = AuditResource | AuditSubTable;

export type AuditLabel = {
  resourceLabel: AuditResourceLabel | null;
  ancestorIds: string[];
};

export const AUDIT_TABLES: Record<AuditResource, AuditableTable> = {
  menu,
  menuSection,
  menuItem,
  menuItemAddOn,
  modifierGroup,
  modifier,
  menuItemModifierGroup,
  order,
  userCoupon,
  coupon,
  banner,
  invoice,
  supplier,
  ingredient,
  recipe,
  organization,
  waitlistTicket,
  member,
  invitation,
  user,
  team,
  pointTransaction,
  pointSetting,
  storePhoto,
};

export const AUDIT_SUB_TABLES: Record<AuditSubTable, AnyPgTable> = {
  offer,
  orderQrSecret: organizationQrSecret,
  printer,
  recipeIngredient,
  refund,
  specialHours: organizationSpecialHours,
  storeLayout,
  waitlistSetting,
};

export const AUDIT_KEY_COLUMNS: Partial<Record<AuditLabelScope, string>> = {
  orderQrSecret: 'organizationId',
  storeLayout: 'organizationId',
  waitlistSetting: 'organizationId',
};

export const AUDIT_IGNORED_COLUMNS: Partial<Record<AuditLabelScope, string[]>> =
  {
    orderQrSecret: ['previousSecret', 'secret'],
    printer: ['digestHa1', 'lastSeenAt', 'pollGapsMs'],
    refund: [
      'ecpayRtnCode',
      'ecpayRtnMsg',
      'invoiceAttempts',
      'invoiceRetryAt',
      'operatorId',
    ],
    team: ['memberCount'],
  };

type LabelSource = { table: AuditableTable; column: string };

const FK_LABEL_SOURCES: Partial<
  Record<AuditLabelScope, Record<string, LabelSource>>
> = {
  menuSection: {
    menuId: { table: menu, column: 'name' },
    orderTicketPrinterId: { table: printer, column: 'name' },
    parentSectionId: { table: menuSection, column: 'name' },
  },
  menuItem: {
    menuId: { table: menu, column: 'name' },
    menuSectionId: { table: menuSection, column: 'name' },
    orderTicketPrinterId: { table: printer, column: 'name' },
  },
  offer: {
    menuItemId: { table: menuItem, column: 'name' },
    menuSectionId: { table: menuSection, column: 'name' },
  },
  menuItemAddOn: {
    addOnMenuItemId: { table: menuItem, column: 'name' },
    addOnMenuSectionId: { table: menuSection, column: 'name' },
    menuItemId: { table: menuItem, column: 'name' },
  },
  modifierGroup: {
    menuId: { table: menu, column: 'name' },
  },
  modifier: {
    modifierGroupId: { table: modifierGroup, column: 'displayName' },
  },
  menuItemModifierGroup: {
    menuItemId: { table: menuItem, column: 'name' },
    modifierGroupId: { table: modifierGroup, column: 'displayName' },
  },
  order: {
    userId: { table: user, column: 'name' },
  },
  userCoupon: {
    couponId: { table: coupon, column: 'code' },
    grantedBy: { table: user, column: 'name' },
    orderId: { table: order, column: 'confirmationNumber' },
    userId: { table: user, column: 'name' },
  },
  invoice: {
    orderId: { table: order, column: 'confirmationNumber' },
  },
  ingredient: {
    supplierId: { table: supplier, column: 'name' },
  },
  recipe: {
    menuItemId: { table: menuItem, column: 'name' },
  },
  recipeIngredient: {
    ingredientId: { table: ingredient, column: 'name' },
  },
  refund: {
    orderId: { table: order, column: 'confirmationNumber' },
  },
  member: {
    userId: { table: user, column: 'name' },
  },
  invitation: {
    inviterId: { table: user, column: 'name' },
  },
  user: {
    impersonatedBy: { table: user, column: 'name' },
  },
  team: {
    member: { table: user, column: 'name' },
  },
  pointTransaction: {
    adjustedBy: { table: user, column: 'name' },
    userId: { table: user, column: 'name' },
  },
};

const asId = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

const asLabel = (value: unknown): AuditResourceLabel | null =>
  typeof value === 'string' || (typeof value === 'object' && value !== null)
    ? (value as AuditResourceLabel)
    : null;

const compact = (...values: (string | null)[]): string[] =>
  values.filter((value): value is string => !!value);

const selectByIds = async (
  db: DrizzleDB,
  table: AuditableTable,
  ids: (string | null)[],
): Promise<Map<string, Row>> => {
  const unique = [...new Set(compact(...ids))];
  if (!unique.length) return new Map();

  const rows = await db.select().from(table).where(inArray(table.id, unique));

  return new Map(
    rows.flatMap((row) =>
      typeof row.id === 'string' ? [[row.id, row] as const] : [],
    ),
  );
};

const selectLabelsByIds = async (
  db: Pick<DrizzleDB, 'select'>,
  { table, column }: LabelSource,
  ids: string[],
): Promise<Map<string, AuditResourceLabel>> => {
  const rows = await db
    .select({ id: table.id, label: getTableColumns(table)[column] })
    .from(table)
    .where(inArray(table.id, ids));

  return new Map(
    rows.flatMap(({ id, label }) => {
      const value = asLabel(label);

      return typeof id === 'string' && value ? [[id, value] as const] : [];
    }),
  );
};

// 連結表與 userCoupon 自己沒有名稱，標籤在一跳之外；巢狀路由還要品項所屬的分類。
// 一個 resource 最多兩次批次查詢，不會隨列數增加
const resolveLinked = async (
  db: DrizzleDB,
  resource: 'menuItemAddOn' | 'menuItemModifierGroup' | 'userCoupon',
  rows: Map<string, Row>,
): Promise<Map<string, AuditLabel>> => {
  const entries = [...rows];

  if (resource === 'userCoupon') {
    const coupons = await selectByIds(
      db,
      coupon,
      entries.map(([, row]) => asId(row.couponId)),
    );

    return new Map(
      entries.map(([id, row]) => [
        id,
        {
          resourceLabel: asLabel(coupons.get(asId(row.couponId) ?? '')?.code),
          ancestorIds: compact(asId(row.couponId)),
        },
      ]),
    );
  }

  const isAddOn = resource === 'menuItemAddOn';
  const [hosts, targets, sections] = await Promise.all([
    selectByIds(
      db,
      menuItem,
      entries.map(([, row]) => asId(row.menuItemId)),
    ),
    isAddOn
      ? selectByIds(
          db,
          menuItem,
          entries.map(([, row]) => asId(row.addOnMenuItemId)),
        )
      : selectByIds(
          db,
          modifierGroup,
          entries.map(([, row]) => asId(row.modifierGroupId)),
        ),
    isAddOn
      ? selectByIds(
          db,
          menuSection,
          entries.map(([, row]) => asId(row.addOnMenuSectionId)),
        )
      : new Map<string, Row>(),
  ]);

  return new Map(
    entries.map(([id, row]) => {
      const host = hosts.get(asId(row.menuItemId) ?? '');
      const target = targets.get(
        asId(isAddOn ? row.addOnMenuItemId : row.modifierGroupId) ?? '',
      );

      return [
        id,
        {
          resourceLabel: asLabel(
            isAddOn
              ? (target?.name ??
                  sections.get(asId(row.addOnMenuSectionId) ?? '')?.name)
              : target?.displayName,
          ),
          ancestorIds: compact(asId(host?.menuSectionId), asId(row.menuItemId)),
        },
      ];
    }),
  );
};

export const resolveAuditLabels = async (
  db: DrizzleDB,
  resource: AuditResource,
  rows: Map<string, Row | undefined>,
): Promise<Map<string, AuditLabel>> => {
  const missing = [...rows]
    .filter(([, row]) => !row)
    .map(([resourceId]) => resourceId);
  const fetched = await selectByIds(db, AUDIT_TABLES[resource], missing);

  const resolved = new Map<string, Row>();
  for (const [resourceId, row] of rows) {
    const value = row ?? fetched.get(resourceId);
    if (value) resolved.set(resourceId, value);
  }

  if (
    resource === 'menuItemAddOn' ||
    resource === 'menuItemModifierGroup' ||
    resource === 'userCoupon'
  )
    return resolveLinked(db, resource, resolved);

  if (resource === 'member') {
    const users = await selectByIds(
      db,
      user,
      [...resolved.values()].map(({ userId }) => asId(userId)),
    );

    return new Map(
      [...resolved].map(([resourceId, row]) => [
        resourceId,
        {
          resourceLabel: asLabel(users.get(asId(row.userId) ?? '')?.name),
          ancestorIds: [],
        },
      ]),
    );
  }

  if (resource === 'recipe') {
    const menuItems = await selectByIds(
      db,
      menuItem,
      [...resolved.values()].map(({ menuItemId }) => asId(menuItemId)),
    );

    return new Map(
      [...resolved].map(([resourceId, row]) => [
        resourceId,
        {
          resourceLabel: asLabel(row.name),
          ancestorIds: compact(
            asId(menuItems.get(asId(row.menuItemId) ?? '')?.menuSectionId),
            asId(row.menuItemId),
          ),
        },
      ]),
    );
  }

  return new Map(
    [...resolved].map(([resourceId, row]) => {
      switch (resource) {
        case 'menuItem':
          return [
            resourceId,
            {
              resourceLabel: asLabel(row.name),
              ancestorIds: compact(asId(row.menuSectionId)),
            },
          ];
        case 'modifier':
          return [
            resourceId,
            {
              resourceLabel: asLabel(row.displayName),
              ancestorIds: compact(asId(row.modifierGroupId)),
            },
          ];
        case 'modifierGroup':
          return [
            resourceId,
            { resourceLabel: asLabel(row.displayName), ancestorIds: [] },
          ];
        case 'order':
          return [
            resourceId,
            {
              resourceLabel: asLabel(row.confirmationNumber),
              ancestorIds: [],
            },
          ];
        case 'coupon':
          return [
            resourceId,
            { resourceLabel: asLabel(row.code), ancestorIds: [] },
          ];
        case 'banner':
        case 'pointTransaction':
          return [resourceId, { resourceLabel: null, ancestorIds: [] }];
        case 'storePhoto':
          return [
            resourceId,
            { resourceLabel: asLabel(row.alt), ancestorIds: [] },
          ];
        case 'waitlistTicket':
          return [
            resourceId,
            {
              resourceLabel:
                typeof row.prefix === 'string' && typeof row.number === 'number'
                  ? formatTicketNumber(row.prefix, row.number)
                  : null,
              ancestorIds: [],
            },
          ];
        case 'invoice':
          return [
            resourceId,
            {
              resourceLabel: asLabel(row.invoiceNumber),
              ancestorIds: compact(asId(row.orderId)),
            },
          ];
        default:
          return [
            resourceId,
            { resourceLabel: asLabel(row.name), ancestorIds: [] },
          ];
      }
    }),
  );
};

export const resolveChangeLabels = async (
  db: Pick<DrizzleDB, 'select'>,
  entries: { scope: AuditLabelScope; changes: AuditChanges }[],
): Promise<(AuditChangeLabels | null)[]> => {
  const sourceOf = (scope: AuditLabelScope, field: string) =>
    FK_LABEL_SOURCES[scope]?.[field];
  const keyOf = ({ table, column }: LabelSource) =>
    `${getTableName(table)}.${column}`;

  // 同一張表會被多個欄位參照（addOn 的兩個品項欄位），依表分組才維持每張表一次查詢
  const grouped = new Map<string, { source: LabelSource; ids: Set<string> }>();

  for (const { scope, changes } of entries)
    for (const [field, { before, after }] of Object.entries(changes)) {
      const source = sourceOf(scope, field);
      if (!source) continue;

      const group = grouped.get(keyOf(source)) ?? { source, ids: new Set() };
      for (const id of compact(asId(before), asId(after))) group.ids.add(id);
      if (group.ids.size) grouped.set(keyOf(source), group);
    }

  if (!grouped.size) return entries.map(() => null);

  const labelsByKey = new Map(
    await Promise.all(
      [...grouped].map(
        async ([key, { source, ids }]) =>
          [key, await selectLabelsByIds(db, source, [...ids])] as const,
      ),
    ),
  );

  return entries.map(({ scope, changes }) => {
    const labels: AuditChangeLabels = {};

    for (const [field, { before, after }] of Object.entries(changes)) {
      const source = sourceOf(scope, field);
      if (!source) continue;

      const names = labelsByKey.get(keyOf(source));
      for (const id of compact(asId(before), asId(after))) {
        const label = names?.get(id);
        if (label) labels[field] = { ...labels[field], [id]: label };
      }
    }

    return Object.keys(labels).length ? labels : null;
  });
};

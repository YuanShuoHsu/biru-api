import { inArray } from 'drizzle-orm';
import type { AnyPgTable, PgColumn } from 'drizzle-orm/pg-core';

import type { AuditResource, AuditResourceLabel } from 'src/db/schema/audit';
import { banner } from 'src/db/schema/banners';
import { coupon, userCoupon } from 'src/db/schema/coupons';
import {
  menu,
  menuItem,
  menuItemAddOn,
  menuItemModifierGroup,
  menuSection,
  modifier,
  modifierGroup,
  offer,
} from 'src/db/schema/menus';
import { order } from 'src/db/schema/orders';
import type { DrizzleDB } from 'src/drizzle/drizzle.module';

import type { AuditSubTable } from '../decorators/audit.decorator';

type Row = Record<string, unknown>;

export type AuditableTable = AnyPgTable & { id: PgColumn };

export type AuditLabel = {
  resourceLabel: AuditResourceLabel | null;
  ancestorIds: string[];
};

export const AUDIT_TABLES: Record<
  AuditResource | AuditSubTable,
  AuditableTable
> = {
  menu,
  menuSection,
  menuItem,
  offer,
  menuItemAddOn,
  modifierGroup,
  modifier,
  menuItemModifierGroup,
  order,
  userCoupon,
  coupon,
  banner,
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
          return [resourceId, { resourceLabel: null, ancestorIds: [] }];
        default:
          return [
            resourceId,
            { resourceLabel: asLabel(row.name), ancestorIds: [] },
          ];
      }
    }),
  );
};

import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
} from 'drizzle-orm';

import {
  platformDateString,
  platformMidnight,
} from '../common/constants/timezone.js';
import {
  menu,
  menuItem,
  offer,
  type Offer,
  type QuantitativeValue,
} from '../db/schema/menus.js';
import { order } from '../db/schema/orders.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';

type Tx = Pick<DrizzleDB, 'select' | 'update'>;

const BUSINESS_DAY_START_MS = 4 * 60 * 60 * 1000;

export const businessDay = (time: number): string =>
  platformDateString(new Date(time - BUSINESS_DAY_START_MS));

const businessDayStart = (time: number): Date =>
  new Date(
    platformMidnight(time - BUSINESS_DAY_START_MS) + BUSINESS_DAY_START_MS,
  );

const dueOffers = (db: Pick<DrizzleDB, 'select'>, organizationId?: string) =>
  db
    .select({ id: offer.id, organizationId: menu.organizationId })
    .from(offer)
    .innerJoin(menuItem, eq(menuItem.id, offer.menuItemId))
    .innerJoin(menu, eq(menu.id, menuItem.menuId))
    .where(
      and(
        organizationId ? eq(menu.organizationId, organizationId) : undefined,
        isNotNull(offer.dailyLimit),
        or(
          isNull(offer.dailyLimitResetOn),
          lt(offer.dailyLimitResetOn, businessDay(Date.now())),
        ),
      ),
    );

export const hasDueDailyLimits = async (
  db: Pick<DrizzleDB, 'select'>,
  organizationId: string,
): Promise<boolean> =>
  (await dueOffers(db, organizationId).limit(1)).length > 0;

export const resetDailyLimits = async (
  tx: Tx,
  organizationId?: string,
): Promise<string[]> => {
  const due = await dueOffers(tx, organizationId)
    .orderBy(asc(offer.id))
    .for('update', { of: offer });
  if (!due.length) return [];

  await tx
    .update(offer)
    .set({
      inventoryLevel: sql`coalesce(${offer.inventoryLevel}, '{}'::jsonb) || jsonb_build_object('value', ${offer.dailyLimit})`,
      dailyLimitResetOn: businessDay(Date.now()),
      updatedAt: new Date(),
    })
    .where(
      inArray(
        offer.id,
        due.map(({ id }) => id),
      ),
    );

  return [...new Set(due.map(({ organizationId }) => organizationId))];
};

export const dailyLimitChanges = async (
  tx: Tx,
  organizationId: string,
  offerId: string | undefined,
  {
    dailyLimit,
    inventoryLevel,
  }: {
    dailyLimit?: number | null;
    inventoryLevel?: QuantitativeValue | null;
  },
): Promise<
  Partial<Pick<Offer, 'dailyLimit' | 'dailyLimitResetOn' | 'inventoryLevel'>>
> => {
  if (dailyLimit === undefined) return {};

  const [current] = offerId
    ? await tx
        .select({
          dailyLimit: offer.dailyLimit,
          inventoryLevel: offer.inventoryLevel,
        })
        .from(offer)
        .where(eq(offer.id, offerId))
        .for('update')
    : [];
  if (dailyLimit === (current?.dailyLimit ?? null)) return {};
  if (dailyLimit === null) return { dailyLimit, dailyLimitResetOn: null };

  const [{ sold }] = offerId
    ? await tx
        .select({
          sold: sql<number>`coalesce(sum((${order.heldOfferStock} ->> ${offerId})::numeric), 0)::float8`,
        })
        .from(order)
        .where(
          and(
            eq(order.sellerId, organizationId),
            gte(order.createdAt, businessDayStart(Date.now())),
          ),
        )
    : [{ sold: 0 }];

  return {
    dailyLimit,
    dailyLimitResetOn: businessDay(Date.now()),
    inventoryLevel: {
      ...(inventoryLevel === undefined
        ? current?.inventoryLevel
        : inventoryLevel),
      value: Math.max(0, dailyLimit - sold),
    },
  };
};

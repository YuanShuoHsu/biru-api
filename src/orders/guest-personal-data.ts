import { and, inArray, isNull, lt, or, sql } from 'drizzle-orm';

import { PERSONAL_DATA_RETENTION_MS } from '../common/constants/personal-data.js';
import { ORDER_ENDED_STATUSES, order } from '../db/schema/orders.js';

export const personalDataCutoff = (now: Date): Date =>
  new Date(now.getTime() - PERSONAL_DATA_RETENTION_MS);

export const maskedCustomerName = sql`left(${order.customer}->>'name', 1) || '**'`;

export const isEndedGuestOrder = and(
  isNull(order.userId),
  inArray(order.orderStatus, [...ORDER_ENDED_STATUSES]),
);

export const isGuestPersonalDataExpired = (now: Date) =>
  and(
    isEndedGuestOrder,
    or(
      lt(order.updatedAt, personalDataCutoff(now)),
      and(
        sql`${order.customer} - 'name' = '{}'::jsonb`,
        sql`${order.customer}->>'name' = ${maskedCustomerName}`,
      ),
    ),
  );

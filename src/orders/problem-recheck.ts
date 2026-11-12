import { and, eq, gte, isNull } from 'drizzle-orm';

import { order } from '../db/schema/orders.js';

const PROBLEM_RECHECK_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export const isProblemAwaitingRecheck = (now: number) =>
  and(
    eq(order.orderStatus, 'OrderProblem'),
    isNull(order.reconciledAt),
    gte(order.createdAt, new Date(now - PROBLEM_RECHECK_WINDOW_MS)),
  );

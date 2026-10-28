import { sql } from 'drizzle-orm';

import { order } from '../db/schema/orders.js';

export const BOARD_AT = sql`COALESCE(${order.pickupTime}, ${order.createdAt})`;

export const BOARD_WINDOW_MS = 24 * 60 * 60 * 1000;

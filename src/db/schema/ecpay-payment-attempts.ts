import { index, numeric, pgTable, text } from 'drizzle-orm/pg-core';

import { timestamps } from './columns.helpers.js';
import { order } from './orders.js';

export const ecpayPaymentAttempt = pgTable(
  'ecpay_payment_attempt',
  {
    merchantTradeNo: text('merchant_trade_no').primaryKey(),
    orderId: text('order_id')
      .notNull()
      .references(() => order.id, { onDelete: 'cascade' }),
    returnUrl: text('return_url'),
    chargeFee: numeric('charge_fee', { precision: 10, scale: 2 }),
    ...timestamps,
  },
  (table) => [index('ecpayPaymentAttempt_orderId_idx').on(table.orderId)],
);

export type EcpayPaymentAttempt = typeof ecpayPaymentAttempt.$inferSelect;

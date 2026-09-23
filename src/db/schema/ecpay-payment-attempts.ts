import { index, pgTable, text } from 'drizzle-orm/pg-core';

import { timestamps } from './columns.helpers';
import { order } from './orders';

export const ecpayPaymentAttempt = pgTable(
  'ecpay_payment_attempt',
  {
    merchantTradeNo: text('merchant_trade_no').primaryKey(),
    orderId: text('order_id')
      .notNull()
      .references(() => order.id, { onDelete: 'cascade' }),
    ...timestamps,
  },
  (table) => [index('ecpayPaymentAttempt_orderId_idx').on(table.orderId)],
);

export type EcpayPaymentAttempt = typeof ecpayPaymentAttempt.$inferSelect;

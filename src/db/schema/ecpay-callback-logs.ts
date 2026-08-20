import {
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
} from 'drizzle-orm/pg-core';

import { timestamps } from './columns.helpers';

export const ecpayCallbackEndpointEnum = pgEnum('ecpay_callback_endpoint', [
  'return',
  'result',
  'query',
]);
export type EcpayCallbackEndpoint =
  (typeof ecpayCallbackEndpointEnum.enumValues)[number];

export const ecpayCallbackLog = pgTable(
  'ecpay_callback_log',
  {
    id: text('id').primaryKey(),
    endpoint: ecpayCallbackEndpointEnum('endpoint').notNull(),
    merchantTradeNo: text('merchant_trade_no'),
    rawBody: jsonb('raw_body').$type<Record<string, string>>().notNull(),
    macValid: boolean('mac_valid').notNull(),
    error: text('error'),
    handled: boolean('handled').notNull().default(false),
    ...timestamps,
  },
  (table) => [
    index('ecpayCallbackLog_merchantTradeNo_idx').on(table.merchantTradeNo),
    index('ecpayCallbackLog_createdAt_idx').on(table.createdAt),
  ],
);

export type EcpayCallbackLog = typeof ecpayCallbackLog.$inferSelect;

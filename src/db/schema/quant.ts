import {
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { timestamps } from './columns.helpers';
import { user } from './users';

const decimal = (name: string) =>
  numeric(name, { mode: 'number', precision: 38, scale: 18 });

export const quantCredential = pgTable(
  'quant_credential',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // 本機、stage、正式環境共用資料庫但 BETTER_AUTH_SECRET 各不相同，別環境的金鑰解不開
    environment: text('environment').notNull(),
    label: text('label').notNull(),
    apiKeyLast4: text('api_key_last4').notNull(),
    encryptedApiKey: text('encrypted_api_key').notNull(),
    encryptedApiSecret: text('encrypted_api_secret').notNull(),
    futuresMaxLeverage: integer('futures_max_leverage'),
    futuresMaxDailyLoss: decimal('futures_max_daily_loss'),
    futuresMinLiquidationDistance: decimal('futures_min_liquidation_distance'),
    ...timestamps,
  },
  (table) => [index('quant_credential_user_id_idx').on(table.userId)],
);

export type QuantCredential = typeof quantCredential.$inferSelect;

// 每位平台管理員自己的 Claude API key；和交易所金鑰一樣依環境分開，別環境的解不開
export const quantAiKey = pgTable(
  'quant_ai_key',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    environment: text('environment').notNull(),
    apiKeyLast4: text('api_key_last4').notNull(),
    encryptedApiKey: text('encrypted_api_key').notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex('quant_ai_key_user_environment_idx').on(
      table.userId,
      table.environment,
    ),
  ],
);

export const quantBotTypeEnum = pgEnum('quant_bot_type', [
  'grid',
  'dca',
  'indicator',
  'webhook',
  'futures_grid',
  'signal',
  'ai',
]);
export const quantBotModeEnum = pgEnum('quant_bot_mode', ['paper', 'live']);
export const quantBotStatusEnum = pgEnum('quant_bot_status', [
  'running',
  'stopped',
  'error',
]);

export const quantBot = pgTable(
  'quant_bot',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    environment: text('environment').notNull(),
    credentialId: text('credential_id').references(() => quantCredential.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    type: quantBotTypeEnum('type').notNull(),
    mode: quantBotModeEnum('mode').notNull(),
    symbol: text('symbol').notNull(),
    status: quantBotStatusEnum('status').notNull().default('stopped'),
    statusReason: text('status_reason'),
    config: jsonb('config').$type<Record<string, unknown>>().notNull(),
    investment: decimal('investment').notNull(),
    paperFeeRate: decimal('paper_fee_rate'),
    maxDailyLoss: decimal('max_daily_loss'),
    pionexBotId: text('pionex_bot_id'),
    pionexSignalType: text('pionex_signal_type'),
    webhookTokenHash: text('webhook_token_hash'),
    orderSequence: integer('order_sequence').notNull().default(0),
    startedAt: timestamp('started_at'),
    stoppedAt: timestamp('stopped_at'),
    archivedAt: timestamp('archived_at'),
    ...timestamps,
  },
  (table) => [
    index('quant_bot_user_id_idx').on(table.userId, table.environment),
    index('quant_bot_status_idx').on(table.environment, table.status),
  ],
);

export type QuantBot = typeof quantBot.$inferSelect;

export const quantBotOrderStatusEnum = pgEnum('quant_bot_order_status', [
  'open',
  'filled',
  'canceled',
  'rejected',
]);

export const quantBotOrder = pgTable(
  'quant_bot_order',
  {
    id: text('id').primaryKey(),
    botId: text('bot_id')
      .notNull()
      .references(() => quantBot.id, { onDelete: 'cascade' }),
    clientOrderId: text('client_order_id').notNull().unique(),
    exchangeOrderId: text('exchange_order_id'),
    side: text('side').$type<'BUY' | 'SELL'>().notNull(),
    type: text('type').$type<'LIMIT' | 'MARKET'>().notNull(),
    price: decimal('price'),
    size: decimal('size'),
    amount: decimal('amount'),
    filledSize: decimal('filled_size').notNull().default(0),
    filledAmount: decimal('filled_amount').notNull().default(0),
    fee: decimal('fee').notNull().default(0),
    status: quantBotOrderStatusEnum('status').notNull().default('open'),
    tag: text('tag'),
    ...timestamps,
  },
  (table) => [
    index('quant_bot_order_bot_id_idx').on(table.botId, table.status),
  ],
);

export type QuantBotOrder = typeof quantBotOrder.$inferSelect;

export const quantBotFill = pgTable(
  'quant_bot_fill',
  {
    id: text('id').primaryKey(),
    botId: text('bot_id')
      .notNull()
      .references(() => quantBot.id, { onDelete: 'cascade' }),
    orderId: text('order_id')
      .notNull()
      .references(() => quantBotOrder.id, { onDelete: 'cascade' }),
    side: text('side').$type<'BUY' | 'SELL'>().notNull(),
    price: decimal('price').notNull(),
    size: decimal('size').notNull(),
    fee: decimal('fee').notNull(),
    feeCoin: text('fee_coin').notNull(),
    filledAt: timestamp('filled_at').notNull(),
  },
  (table) => [
    index('quant_bot_fill_bot_id_idx').on(table.botId, table.filledAt),
  ],
);

export type QuantBotFill = typeof quantBotFill.$inferSelect;

export const quantBotEvent = pgTable(
  'quant_bot_event',
  {
    id: text('id').primaryKey(),
    botId: text('bot_id')
      .notNull()
      .references(() => quantBot.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('quant_bot_event_bot_id_idx').on(table.botId, table.createdAt),
  ],
);

// 同一環境只允許一台伺服器執行機器人；連線池是 transaction 模式，advisory lock 不可靠
export const quantEngineLease = pgTable('quant_engine_lease', {
  environment: text('environment').primaryKey(),
  holderId: text('holder_id').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

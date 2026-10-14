import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { AsyncLocalStorage } from 'node:async_hooks';

import type { Transaction } from '../attendance/attendance-audit';
import { db } from '../db';
import * as schema from '../db/schema';

const transactions = new AsyncLocalStorage<Transaction>();

// better-auth 的 hooks 在批次交易內要用同一條連線，否則看不到尚未提交的刪除，寫入被鎖住的列還會互等卡死
export const authDb = () => transactions.getStore() ?? db;

export const authDatabase = (database: typeof db | Transaction) =>
  drizzleAdapter(database, { provider: 'pg', schema });

export const runInAuthTransaction = <T>(
  tx: Transaction,
  fn: () => Promise<T>,
) => transactions.run(tx, fn);

export const runInAuthSavepoint = <T>(fn: () => Promise<T>) => {
  const tx = transactions.getStore();

  return tx
    ? tx.transaction((savepoint) => transactions.run(savepoint, fn))
    : fn();
};

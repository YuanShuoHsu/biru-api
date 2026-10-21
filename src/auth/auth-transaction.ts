import { AsyncLocalStorage } from 'node:async_hooks';

import type { Transaction } from '../attendance/attendance-audit.js';
import { db } from '../db/index.js';

const transactions = new AsyncLocalStorage<Transaction>();

export const authDb = () => transactions.getStore() ?? db;

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

import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

import { assertPayrollUnlocked, type Transaction } from './attendance-audit';

async function lockedMonths(startsAt: Date, endsAt?: Date) {
  let where: SQL | undefined;
  const query = {
    from: () => query,
    where: (condition: SQL) => {
      where = condition;
      return query;
    },
    limit: () => Promise.resolve([]),
  };
  const tx = { select: () => query } as unknown as Transaction;
  await assertPayrollUnlocked(tx, 'org', 'employee', startsAt, endsAt);
  const { params } = new PgDialect().sqlToQuery(where!);
  return params.filter((param) => /^\d{4}-\d{2}$/.test(String(param)));
}

describe('assertPayrollUnlocked', () => {
  it('locks the store-local months an interval touches', async () => {
    expect(
      await lockedMonths(
        new Date('2026-01-31T16:00:00Z'),
        new Date('2026-03-31T16:00:00Z'),
      ),
    ).toEqual(['2026-02', '2026-03']);
  });
  it('leaves the upper bound open when the change affects every later month', async () => {
    expect(await lockedMonths(new Date('2026-01-31T15:59:59Z'))).toEqual([
      '2026-01',
    ]);
  });
});

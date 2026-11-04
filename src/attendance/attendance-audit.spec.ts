import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';

import {
  assertPayrollUnlocked,
  assertShiftPayrollUnlocked,
  type Transaction,
} from './attendance-audit.js';

async function lockedMonths(assert: (tx: Transaction) => Promise<void>) {
  let where: SQL | undefined;
  const query = {
    from: () => query,
    where: (condition: SQL) => {
      where = condition;
      return query;
    },
    limit: () => Promise.resolve([]),
  };
  await assert({ select: () => query } as unknown as Transaction);
  const { params } = new PgDialect().sqlToQuery(where!);
  return params.filter((param) => /^\d{4}-\d{2}$/.test(String(param)));
}

describe('assertPayrollUnlocked', () => {
  it('locks the store-local months an interval touches', async () => {
    expect(
      await lockedMonths((tx) =>
        assertPayrollUnlocked(
          tx,
          'org',
          'employee',
          new Date('2026-01-31T16:00:00Z'),
          new Date('2026-03-31T16:00:00Z'),
        ),
      ),
    ).toEqual(['2026-02', '2026-03']);
  });
  it('leaves the upper bound open when the change affects every later month', async () => {
    expect(
      await lockedMonths((tx) =>
        assertPayrollUnlocked(
          tx,
          'org',
          'employee',
          new Date('2026-01-31T15:59:59Z'),
        ),
      ),
    ).toEqual(['2026-01']);
  });
});

describe('assertShiftPayrollUnlocked', () => {
  it('locks the 12 months whose weekly-hours average the shift feeds', async () => {
    expect(
      await lockedMonths((tx) =>
        assertShiftPayrollUnlocked(tx, 'org', 'employee', {
          startsAt: new Date('2026-01-15T01:00:00Z'),
          endsAt: new Date('2026-01-15T10:00:00Z'),
        }),
      ),
    ).toEqual(['2026-01', '2027-01']);
  });
  it('ends the lock at the store-local anniversary of the shift end', async () => {
    expect(
      await lockedMonths((tx) =>
        assertShiftPayrollUnlocked(tx, 'org', 'employee', {
          startsAt: new Date('2026-02-28T01:00:00Z'),
          endsAt: new Date('2026-02-28T16:00:00Z'),
        }),
      ),
    ).toEqual(['2026-02', '2027-02']);
  });
});

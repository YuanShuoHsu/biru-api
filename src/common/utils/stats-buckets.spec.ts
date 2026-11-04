import { BadRequestException } from '@nestjs/common';

import type { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';

import { createPGlite } from '../../../test/pglite.js';
import type { StatsBucketQueryDto } from '../dto/stats-bucket-query.dto.js';

import { getStatsWindow, utcTimestampParam } from './stats-buckets.js';

const taipei = (local: string) => new Date(`${local}+08:00`);

describe('getStatsWindow', () => {
  describe('day / hour', () => {
    const today = {
      since: taipei('2026-11-04T00:00:00').toISOString(),
      bucketUnit: 'hour',
      bucketSize: 1,
      bucketCount: 24,
    } satisfies StatsBucketQueryDto;

    it('本期進行中時，上期只取到同樣的經過時間', () => {
      const window = getStatsWindow(today, taipei('2026-11-04T10:00:00'));

      expect(window.previousSince).toEqual(taipei('2026-11-03T00:00:00'));
      expect(window.previousUntil).toEqual(taipei('2026-11-03T10:00:00'));
    });

    it('本期已結束時，上期為完整的前一段', () => {
      const window = getStatsWindow(today, taipei('2026-11-06T00:00:00'));

      expect(window.previousUntil).toEqual(window.since);
    });

    it('本期還沒開始時，上期為空區間', () => {
      const window = getStatsWindow(today, taipei('2026-11-03T12:00:00'));

      expect(window.previousUntil).toEqual(window.previousSince);
    });
  });

  describe('month', () => {
    it('依平台時區的月曆月份切格，跨年也正確', () => {
      const window = getStatsWindow(
        {
          since: taipei('2025-12-01T00:00:00').toISOString(),
          bucketUnit: 'month',
          bucketSize: 1,
          bucketCount: 3,
        } satisfies StatsBucketQueryDto,
        taipei('2026-04-01T00:00:00'),
      );

      expect(window.bucketStarts).toEqual([
        taipei('2025-12-01T00:00:00').toISOString(),
        taipei('2026-01-01T00:00:00').toISOString(),
        taipei('2026-02-01T00:00:00').toISOString(),
      ]);
      expect(window.until).toEqual(taipei('2026-03-01T00:00:00'));
      expect(window.previousSince).toEqual(taipei('2025-09-01T00:00:00'));
      expect(window.previousUntil).toEqual(window.since);
    });

    it('since 不是平台時區的月初時回 400', () => {
      expect(() =>
        getStatsWindow({
          since: '2025-12-01T00:00:00.000Z',
          bucketUnit: 'month',
          bucketSize: 1,
          bucketCount: 12,
        } satisfies StatsBucketQueryDto),
      ).toThrow(BadRequestException);
    });

    it('本期進行中時，上期對到同樣月數之前的同一個時間點', () => {
      const window = getStatsWindow(
        {
          since: taipei('2025-12-01T00:00:00').toISOString(),
          bucketUnit: 'month',
          bucketSize: 1,
          bucketCount: 12,
        } satisfies StatsBucketQueryDto,
        taipei('2026-11-04T10:00:00'),
      );

      expect(window.previousSince).toEqual(taipei('2024-12-01T00:00:00'));
      expect(window.previousUntil).toEqual(taipei('2025-11-04T10:00:00'));
    });

    it('多個月一格時，上期往前推整段的月數', () => {
      const window = getStatsWindow(
        {
          since: taipei('2026-01-01T00:00:00').toISOString(),
          bucketUnit: 'month',
          bucketSize: 3,
          bucketCount: 4,
        } satisfies StatsBucketQueryDto,
        taipei('2026-05-10T00:00:00'),
      );

      expect(window.until).toEqual(taipei('2027-01-01T00:00:00'));
      expect(window.previousSince).toEqual(taipei('2025-01-01T00:00:00'));
      expect(window.previousUntil).toEqual(taipei('2025-05-10T00:00:00'));
    });

    it('月數超過上限時回 400', () => {
      expect(() =>
        getStatsWindow({
          since: taipei('2026-01-01T00:00:00').toISOString(),
          bucketUnit: 'month',
          bucketSize: 366,
          bucketCount: 400,
        } satisfies StatsBucketQueryDto),
      ).toThrow(BadRequestException);
    });

    it('上期的對應月份較短時，截在該月月底', () => {
      const window = getStatsWindow(
        {
          since: taipei('2026-03-01T00:00:00').toISOString(),
          bucketUnit: 'month',
          bucketSize: 1,
          bucketCount: 1,
        } satisfies StatsBucketQueryDto,
        taipei('2026-03-31T12:00:00'),
      );

      expect(window.previousSince).toEqual(taipei('2026-02-01T00:00:00'));
      expect(window.previousUntil).toEqual(taipei('2026-03-01T00:00:00'));
    });

    describe('bucketIndexOf', () => {
      let client: PGlite;

      beforeAll(() => {
        client = createPGlite();
      });

      afterAll(async () => {
        await client.close();
      });

      const indexOf = async (bucketSize: number, at: Date) => {
        const { bucketIndexOf } = getStatsWindow({
          since: taipei('2025-12-01T00:00:00').toISOString(),
          bucketUnit: 'month',
          bucketSize,
          bucketCount: 12,
        } satisfies StatsBucketQueryDto);
        const { rows } = await drizzle(client).execute<{ index: number }>(
          sql`SELECT ${bucketIndexOf(utcTimestampParam(at))} AS index`,
        );
        return rows[0].index;
      };

      it('以平台時區的午夜分月', async () => {
        await expect(indexOf(1, taipei('2025-12-31T23:59:59'))).resolves.toBe(
          0,
        );
        await expect(indexOf(1, taipei('2026-01-01T00:00:00'))).resolves.toBe(
          1,
        );
        await expect(indexOf(1, taipei('2026-11-30T12:00:00'))).resolves.toBe(
          11,
        );
      });

      it('多個月一格時以 bucketSize 取整', async () => {
        await expect(indexOf(3, taipei('2026-02-28T12:00:00'))).resolves.toBe(
          0,
        );
        await expect(indexOf(3, taipei('2026-03-01T00:00:00'))).resolves.toBe(
          1,
        );
      });
    });
  });
});

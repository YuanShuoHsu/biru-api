import { type Column, type SQL, sql } from 'drizzle-orm';

import type {
  StatsBucketQueryDto,
  StatsBucketUnit,
} from '../dto/stats-bucket-query.dto';

const BUCKET_UNIT_MS: Record<StatsBucketUnit, number> = {
  day: 24 * 60 * 60 * 1000,
  hour: 60 * 60 * 1000,
};

// 時間欄位是不帶時區的 UTC；直接綁 Date 會被 pg 序列化成本地時間再丟掉時區
export const utcTimestampParam = (at: Date): SQL =>
  sql`${at.toISOString()}::timestamp`;

export const getStatsWindow = ({
  bucketCount,
  bucketSize,
  bucketUnit,
  since,
}: StatsBucketQueryDto) => {
  const sinceDate = new Date(since);
  const bucketMs = bucketSize * BUCKET_UNIT_MS[bucketUnit];
  const periodMs = bucketCount * bucketMs;

  return {
    since: sinceDate,
    until: new Date(sinceDate.getTime() + periodMs),
    previousSince: new Date(sinceDate.getTime() - periodMs),
    bucketStarts: Array.from({ length: bucketCount }, (_, index) =>
      new Date(sinceDate.getTime() + index * bucketMs).toISOString(),
    ),
    // 運算式含綁定參數，SELECT 與 GROUP BY 會拿到不同編號被視為不同運算式，呼叫端要以欄位位置分組
    bucketIndexOf: (at: SQL | Column) =>
      sql<number>`FLOOR(EXTRACT(EPOCH FROM ${at} - ${utcTimestampParam(sinceDate)}) * 1000 / ${bucketMs})::int`,
  };
};

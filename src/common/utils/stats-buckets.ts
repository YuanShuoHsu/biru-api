import { BadRequestException } from '@nestjs/common';
import { type Column, type SQL, sql } from 'drizzle-orm';
import { I18nContext } from 'nestjs-i18n';

import type { I18nTranslations } from '../../generated/i18n.generated.js';
import {
  PLATFORM_TIMEZONE,
  platformMonthStart,
  toPlatformTime,
} from '../constants/timezone.js';
import type {
  StatsBucketQueryDto,
  StatsBucketUnit,
} from '../dto/stats-bucket-query.dto.js';

const BUCKET_UNIT_MS: Record<Exclude<StatsBucketUnit, 'month'>, number> = {
  day: 24 * 60 * 60 * 1000,
  hour: 60 * 60 * 1000,
};

// 時間欄位是不帶時區的 UTC；直接綁 Date 會被 pg 序列化成本地時間再丟掉時區
export const utcTimestampParam = (at: Date): SQL =>
  sql`${at.toISOString()}::timestamp`;

const platformMonthSerial = (at: Date): number => {
  const local = toPlatformTime(at);
  return local.getUTCFullYear() * 12 + local.getUTCMonth();
};

const monthStartOf = (serial: number): Date =>
  platformMonthStart(Math.floor(serial / 12), serial % 12);

const MAX_PERIOD_MONTHS = 1200;

const badRequest = (code: 'badRequest' | 'statsSinceNotMonthStart') =>
  new BadRequestException({
    error: 'Bad Request',
    code,
    message:
      I18nContext.current<I18nTranslations>()?.t(`common.exceptions.${code}`) ??
      code,
  });

const getMonthWindow = (
  { bucketCount, bucketSize }: StatsBucketQueryDto,
  sinceDate: Date,
  now: Date,
) => {
  const periodMonths = bucketCount * bucketSize;
  if (periodMonths > MAX_PERIOD_MONTHS) throw badRequest('badRequest');

  const sinceSerial = platformMonthSerial(sinceDate);
  if (monthStartOf(sinceSerial).getTime() !== sinceDate.getTime())
    throw badRequest('statsSinceNotMonthStart');

  const until = monthStartOf(sinceSerial + periodMonths);
  const previousSince = monthStartOf(sinceSerial - periodMonths);

  let previousUntil = sinceDate;
  if (now < sinceDate) previousUntil = previousSince;
  else if (now < until) {
    const nowSerial = platformMonthSerial(now);
    const elapsedInMonth = now.getTime() - monthStartOf(nowSerial).getTime();
    const previousMonth = nowSerial - periodMonths;
    previousUntil = new Date(
      Math.min(
        monthStartOf(previousMonth).getTime() + elapsedInMonth,
        monthStartOf(previousMonth + 1).getTime(),
      ),
    );
  }

  return {
    since: sinceDate,
    until,
    previousSince,
    previousUntil,
    bucketStarts: Array.from({ length: bucketCount }, (_, index) =>
      monthStartOf(sinceSerial + index * bucketSize).toISOString(),
    ),
    bucketIndexOf: (at: SQL | Column) => {
      const local = sql`${at} AT TIME ZONE 'UTC' AT TIME ZONE ${PLATFORM_TIMEZONE}`;
      return sql<number>`FLOOR((EXTRACT(YEAR FROM ${local}) * 12 + EXTRACT(MONTH FROM ${local}) - 1 - ${sinceSerial}) / ${bucketSize})::int`;
    },
  };
};

export const getStatsWindow = (
  query: StatsBucketQueryDto,
  now: Date = new Date(),
) => {
  const sinceDate = new Date(query.since);
  if (query.bucketUnit === 'month')
    return getMonthWindow(query, sinceDate, now);

  const { bucketCount, bucketSize, bucketUnit } = query;
  const bucketMs = bucketSize * BUCKET_UNIT_MS[bucketUnit];
  const periodMs = bucketCount * bucketMs;
  const previousSince = new Date(sinceDate.getTime() - periodMs);
  const elapsedMs = Math.min(
    Math.max(now.getTime() - sinceDate.getTime(), 0),
    periodMs,
  );

  return {
    since: sinceDate,
    until: new Date(sinceDate.getTime() + periodMs),
    previousSince,
    previousUntil: new Date(previousSince.getTime() + elapsedMs),
    bucketStarts: Array.from({ length: bucketCount }, (_, index) =>
      new Date(sinceDate.getTime() + index * bucketMs).toISOString(),
    ),
    // 運算式含綁定參數，SELECT 與 GROUP BY 會拿到不同編號被視為不同運算式，呼叫端要以欄位位置分組
    bucketIndexOf: (at: SQL | Column) =>
      sql<number>`FLOOR(EXTRACT(EPOCH FROM ${at} - ${utcTimestampParam(sinceDate)}) * 1000 / ${bucketMs})::int`,
  };
};

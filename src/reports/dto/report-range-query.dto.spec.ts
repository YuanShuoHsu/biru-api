import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { ReportRangeQueryDto } from './report-range-query.dto.js';

const errorsOf = async (since: string) =>
  (
    await validate(
      plainToInstance(ReportRangeQueryDto, {
        since,
        until: '2026-12-01T00:00:00+08:00',
      }),
    )
  ).map(({ property }) => property);

describe('ReportRangeQueryDto', () => {
  it.each([
    '2026-11-01T00:00:00+08:00',
    '2026-11-01T00:00:00Z',
    '2026-11-01T00:00:00.000+08:00',
  ])('接受帶時區的 %s', async (since) => {
    expect(await errorsOf(since)).toEqual([]);
  });

  it.each([
    ['只有日期，會被當成 UTC 午夜', '2026-11-01'],
    ['沒有時區，會依伺服器時區解析', '2026-11-01T00:00:00'],
    ['週日期，new Date() 無法解析', '2026-W01'],
    ['序數日期，new Date() 無法解析', '2026-123'],
    ['不存在的日期，new Date() 會進位到 3 月', '2026-02-30T00:00:00+08:00'],
    ['閏秒，new Date() 無法解析', '2026-12-31T23:59:60Z'],
  ])('拒絕%s：%s', async (_, since) => {
    expect(await errorsOf(since)).toEqual(['since']);
  });
});

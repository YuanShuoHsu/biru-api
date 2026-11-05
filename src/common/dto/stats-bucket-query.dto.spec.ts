import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { MenuItemSalesQueryDto } from '../../orders/dto/menu-item-sales.dto.js';
import { QuantBotFillMarkerQueryDto } from '../../quant/dto/quant-bot.dto.js';
import { WaitlistStatsQueryDto } from '../../waitlist/dto/waitlist-stats.dto.js';

import { StatsBucketQueryDto } from './stats-bucket-query.dto.js';

const VALID = '2026-10-31T16:00:00.000Z';

const queries = [
  [
    StatsBucketQueryDto,
    'since',
    { bucketUnit: 'day', bucketSize: '1', bucketCount: '7' },
  ],
  [MenuItemSalesQueryDto, 'since', {}],
  [MenuItemSalesQueryDto, 'until', {}],
  [WaitlistStatsQueryDto, 'since', {}],
  [WaitlistStatsQueryDto, 'until', { since: VALID }],
  [QuantBotFillMarkerQueryDto, 'since', {}],
] as const;

const errorsOf = async (
  [dto, field, rest]: (typeof queries)[number],
  value: string,
) =>
  (
    await validate(
      plainToInstance(dto as new () => object, {
        since: VALID,
        ...rest,
        [field]: value,
      }),
    )
  ).map(({ property }) => property);

describe.each(
  queries.map((query) => ({ name: `${query[0].name}.${query[1]}`, query })),
)('$name', ({ query }) => {
  it.each([VALID, '2026-11-01T00:00:00+08:00'])(
    '接受帶時區的 %s',
    async (value) => {
      expect(await errorsOf(query, value)).toEqual([]);
    },
  );

  it.each([
    ['只有日期，會被當成 UTC 午夜', '2026-11-01'],
    ['沒有時區，會依伺服器時區解析', '2026-11-01T00:00:00'],
    ['週日期，new Date() 無法解析', '2026-W01'],
    ['不存在的日期，new Date() 會進位到 3 月', '2026-02-30T00:00:00+08:00'],
    ['閏秒，new Date() 無法解析', '2026-12-31T23:59:60Z'],
  ])('拒絕%s：%s', async (_, value) => {
    expect(await errorsOf(query, value)).toEqual([query[1]]);
  });
});

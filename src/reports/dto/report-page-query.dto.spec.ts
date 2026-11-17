import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { InventoryReportPageQueryDto } from './inventory-report.dto.js';
import { PersonnelCostReportPageQueryDto } from './personnel-cost-report.dto.js';
import { SalesReportPageQueryDto } from './sales-report.dto.js';

const range = {
  since: '2026-11-01T00:00:00+08:00',
  until: '2026-12-01T00:00:00+08:00',
};

describe.each([
  [SalesReportPageQueryDto, { ...range, groupBy: 'day' }, 'net'],
  [InventoryReportPageQueryDto, range, 'variance'],
  [PersonnelCostReportPageQueryDto, { month: '2026-10' }, 'totalCents'],
] as const)('%o', (Dto, base, sortBy) => {
  const parse = (query: Record<string, string>) =>
    plainToInstance(Dto, { ...base, ...query });
  const errorsOf = async (query: Record<string, string>) =>
    (await validate(parse(query))).map(({ property }) => property);

  it('沒有 limit 時不帶預設值，回傳所有列', async () => {
    expect(parse({}).limit).toBeUndefined();
    expect(await errorsOf({})).toEqual([]);
  });

  it('接受報表欄位的排序與篩選，limit 最多 100', async () => {
    expect(
      await errorsOf({
        limit: '100',
        offset: '20',
        sortBy,
        sortDirection: 'desc',
        filterField: sortBy,
        filterOperator: '>',
        filterValue: '0',
      }),
    ).toEqual([]);
    expect(
      await errorsOf({ limit: '101', sortBy: 'id', filterField: 'id' }),
    ).toEqual(['filterField', 'sortBy', 'limit']);
  });
});

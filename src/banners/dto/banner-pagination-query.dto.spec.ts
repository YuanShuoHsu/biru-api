import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { BannerPaginationQueryDto } from './banner-pagination-query.dto.js';

const parse = (query: Record<string, unknown>) =>
  plainToInstance(BannerPaginationQueryDto, query);

const invalidProperties = async (query: Record<string, unknown>) =>
  (await validate(parse(query))).map(({ property }) => property);

describe('BannerPaginationQueryDto', () => {
  it('defaults to the first page of 10', () => {
    expect(parse({})).toMatchObject({ limit: 10, offset: 0 });
  });

  it('accepts a full banner query string', async () => {
    const query = parse({
      filterField: 'startsAt',
      filterOperator: 'after',
      filterValue: '2026-10-01',
      limit: '25',
      offset: '50',
      quickFilterEnums: 'isActive:true',
      quickFilterValue: 'true',
      sortBy: 'endsAt',
      sortDirection: 'desc',
    });

    expect(await validate(query)).toEqual([]);
    expect(query).toMatchObject({
      limit: 25,
      offset: 50,
      quickFilterEnums: ['isActive:true'],
    });
  });

  it('accepts filtering and sorting by link', async () => {
    expect(
      await invalidProperties({
        filterField: 'url',
        filterOperator: 'contains',
        filterValue: '/order',
        sortBy: 'url',
      }),
    ).toEqual([]);
  });

  it.each([
    [{ limit: 'abc' }, 'limit'],
    [{ limit: '0' }, 'limit'],
    [{ limit: '101' }, 'limit'],
    [{ offset: '-1' }, 'offset'],
    [{ filterOperator: 'like' }, 'filterOperator'],
    [{ sortDirection: 'up' }, 'sortDirection'],
    [{ filterField: 'image' }, 'filterField'],
    [{ sortBy: 'sortOrder' }, 'sortBy'],
  ])('rejects %j', async (query, property) => {
    expect(await invalidProperties(query)).toEqual([property]);
  });
});

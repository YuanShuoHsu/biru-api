import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { AuditLogPaginationQueryDto } from './audit-log-pagination-query.dto.js';

const parse = (query: Record<string, unknown>) =>
  plainToInstance(AuditLogPaginationQueryDto, query);

const invalidProperties = async (query: Record<string, unknown>) =>
  (await validate(parse(query))).map(({ property }) => property);

describe('AuditLogPaginationQueryDto', () => {
  it('defaults to the first page of 10', () => {
    expect(parse({})).toMatchObject({ limit: 10, offset: 0 });
  });

  it('accepts a full audit log query string', async () => {
    const query = parse({
      ancestorId: 'coupon-1',
      filterField: 'createdAt',
      filterOperator: 'after',
      filterValue: '2026-10-01',
      limit: '25',
      offset: '50',
      quickFilterEnums: 'resource:order',
      quickFilterValue: 'order',
      resource: 'order',
      resourceId: 'order-1',
      sortBy: 'createdAt',
      sortDirection: 'asc',
    });

    expect(await validate(query)).toEqual([]);
    expect(query).toMatchObject({
      limit: 25,
      offset: 50,
      quickFilterEnums: ['resource:order'],
    });
  });

  it.each([
    [{ limit: 'abc' }, 'limit'],
    [{ limit: '0' }, 'limit'],
    [{ limit: '101' }, 'limit'],
    [{ offset: '-1' }, 'offset'],
    [{ filterOperator: 'like' }, 'filterOperator'],
    [{ sortDirection: 'up' }, 'sortDirection'],
    [{ resource: 'unknown' }, 'resource'],
    [{ filterField: 'changes' }, 'filterField'],
    [{ sortBy: 'resourceId' }, 'sortBy'],
  ])('rejects %j', async (query, property) => {
    expect(await invalidProperties(query)).toEqual([property]);
  });
});

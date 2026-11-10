import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { UserSessionPaginationQueryDto } from './user-session-pagination-query.dto.js';

const parse = (query: Record<string, unknown>) =>
  plainToInstance(UserSessionPaginationQueryDto, query);

const invalidProperties = async (query: Record<string, unknown>) =>
  (await validate(parse(query))).map(({ property }) => property);

describe('UserSessionPaginationQueryDto', () => {
  it('defaults to the first page of 10', () => {
    expect(parse({})).toMatchObject({ limit: 10, offset: 0 });
  });

  it('accepts a full user session query string', async () => {
    const query = parse({
      filterField: 'expiresAt',
      filterOperator: 'after',
      filterValue: '2026-10-01',
      limit: '25',
      offset: '50',
      quickFilterEnums: 'ipAddress:127.0.0.1',
      quickFilterValue: 'Chrome',
      sortBy: 'userAgent',
      sortDirection: 'asc',
    });

    expect(await validate(query)).toEqual([]);
    expect(query).toMatchObject({
      limit: 25,
      offset: 50,
      quickFilterEnums: ['ipAddress:127.0.0.1'],
    });
  });

  it.each([
    [{ limit: 'abc' }, 'limit'],
    [{ limit: '0' }, 'limit'],
    [{ limit: '101' }, 'limit'],
    [{ offset: '-1' }, 'offset'],
    [{ filterOperator: 'like' }, 'filterOperator'],
    [{ sortDirection: 'up' }, 'sortDirection'],
    [{ filterField: 'token' }, 'filterField'],
    [{ sortBy: 'token' }, 'sortBy'],
  ])('rejects %j', async (query, property) => {
    expect(await invalidProperties(query)).toEqual([property]);
  });
});

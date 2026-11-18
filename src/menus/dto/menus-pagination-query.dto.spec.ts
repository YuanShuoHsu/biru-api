import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validate } from 'class-validator';

import { AddOnPaginationQueryDto } from './add-on-pagination-query.dto.js';
import { MenuItemPaginationQueryDto } from './menu-item-pagination-query.dto.js';
import { MenuSectionPaginationQueryDto } from './menu-section-pagination-query.dto.js';
import { ModifierGroupPaginationQueryDto } from './modifier-group-pagination-query.dto.js';
import { ModifierPaginationQueryDto } from './modifier-pagination-query.dto.js';

const parse = (
  dto: ClassConstructor<object>,
  query: Record<string, unknown>,
): object => plainToInstance(dto, query);

const invalidProperties = async (
  dto: ClassConstructor<object>,
  query: Record<string, unknown>,
) =>
  (
    await validate(parse(dto, query), {
      whitelist: true,
      forbidNonWhitelisted: true,
    })
  ).map(({ property }) => property);

describe.each([
  [MenuSectionPaginationQueryDto, 'name', false],
  [MenuItemPaginationQueryDto, 'price', true],
  [ModifierPaginationQueryDto, 'priceAdjustment', true],
  [AddOnPaginationQueryDto, 'addOnMenuItemName', false],
  [ModifierGroupPaginationQueryDto, 'minSelectionCount', false],
] as const)('%o', (dto, field, acceptsQuickFilterEnums) => {
  it('defaults to the first page of 10', () => {
    expect(parse(dto, {})).toMatchObject({ limit: 10, offset: 0 });
  });

  it('accepts a full query string', async () => {
    const query = {
      filterField: field,
      filterOperator: 'equals',
      filterValue: '1',
      limit: '25',
      offset: '50',
      quickFilterValue: 'x',
      sortBy: field,
      sortDirection: 'desc',
    };

    expect(await invalidProperties(dto, query)).toEqual([]);
    expect(parse(dto, query)).toMatchObject({
      limit: 25,
      offset: 50,
    });
  });

  it(`${acceptsQuickFilterEnums ? 'accepts' : 'rejects'} quickFilterEnums`, async () => {
    expect(
      await invalidProperties(dto, { quickFilterEnums: 'availability:x' }),
    ).toEqual(acceptsQuickFilterEnums ? [] : ['quickFilterEnums']);
  });

  it.each([
    [{ limit: 'abc' }, 'limit'],
    [{ limit: '0' }, 'limit'],
    [{ limit: '101' }, 'limit'],
    [{ offset: '-1' }, 'offset'],
    [{ filterOperator: 'like' }, 'filterOperator'],
    [{ sortDirection: 'up' }, 'sortDirection'],
    [{ filterField: 'unknown' }, 'filterField'],
    [{ sortBy: 'unknown' }, 'sortBy'],
  ])('rejects %j', async (query, property) => {
    expect(await invalidProperties(dto, query)).toEqual([property]);
  });
});

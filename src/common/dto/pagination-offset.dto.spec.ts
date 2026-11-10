import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { AddOnPaginationQueryDto } from '../../menus/dto/add-on-pagination-query.dto.js';
import { MenuItemPaginationQueryDto } from '../../menus/dto/menu-item-pagination-query.dto.js';
import { MenuSectionPaginationQueryDto } from '../../menus/dto/menu-section-pagination-query.dto.js';
import { ModifierGroupPaginationQueryDto } from '../../menus/dto/modifier-group-pagination-query.dto.js';
import { ModifierPaginationQueryDto } from '../../menus/dto/modifier-pagination-query.dto.js';
import { OrderPaginationQueryDto } from '../../orders/dto/order-pagination-query.dto.js';
import { UserOrderPaginationQueryDto } from '../../orders/dto/user-order-pagination-query.dto.js';
import { ListUsersQueryDto } from '../../users/dto/list-users-query.dto.js';

import { PaginationQueryDto } from './pagination-query.dto.js';

const offsetErrors = async (dto: new () => object, offset: string) =>
  (await validate(plainToInstance(dto, { offset })))
    .map(({ property }) => property)
    .filter((property) => property === 'offset');

describe.each([
  PaginationQueryDto,
  AddOnPaginationQueryDto,
  MenuItemPaginationQueryDto,
  MenuSectionPaginationQueryDto,
  ModifierGroupPaginationQueryDto,
  ModifierPaginationQueryDto,
  OrderPaginationQueryDto,
  UserOrderPaginationQueryDto,
  ListUsersQueryDto,
])('%o offset', (dto) => {
  it('accepts the largest safe integer', async () => {
    expect(await offsetErrors(dto, String(Number.MAX_SAFE_INTEGER))).toEqual(
      [],
    );
  });

  it('rejects an offset Postgres cannot bind as bigint', async () => {
    expect(await offsetErrors(dto, '1e19')).toEqual(['offset']);
  });
});

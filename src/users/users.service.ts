import { Inject, Injectable } from '@nestjs/common';

import {
  SQL,
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  ne,
  notIlike,
  or,
  sql,
} from 'drizzle-orm';
import * as schema from 'src/db/schema';
import type { CreateUser, User } from 'src/db/schema/users';
import { user } from 'src/db/schema/users';
import type { DrizzleDB } from 'src/drizzle/drizzle.module';
import { DRIZZLE } from 'src/drizzle/drizzle.module';

import type {
  BooleanFilterField,
  EnumFilterField,
  EnumFilterOperator,
  ListUsersQueryDto,
  SearchOperator,
  StringFilterField,
  TextFilterOperator,
} from './dto/list-users-query.dto';
import {
  BOOLEAN_FILTER_FIELDS,
  ENUM_FILTER_FIELDS,
  ENUM_FILTER_OPERATORS,
  STRING_FILTER_FIELDS,
} from './dto/list-users-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';

type QuickFilterField = EnumFilterField | BooleanFilterField;

const NO_VALUE_OPERATORS: readonly string[] = ['isEmpty', 'isNotEmpty'];

function parseQuickFilterValue(value: string):
  | {
      field: QuickFilterField;
      value: string;
    }
  | undefined {
  const [field, ...rest] = value.split(':');
  const filterValue = rest.join(':');

  if (!filterValue) return undefined;

  if (field === 'role' && (filterValue === 'admin' || filterValue === 'user')) {
    return { field, value: filterValue };
  }

  if (
    (field === 'banned' || field === 'emailSubscribed') &&
    (filterValue === 'true' || filterValue === 'false')
  ) {
    return { field, value: filterValue };
  }
}

function buildStringFilterCondition(
  field: typeof user.name | typeof user.email,
  operator: TextFilterOperator,
  value: string,
): SQL | undefined {
  switch (operator) {
    case 'equals':
      return eq(field, value);
    case 'doesNotEqual':
      return ne(field, value);
    case 'contains':
      return ilike(field, `%${value}%`);
    case 'doesNotContain':
      return notIlike(field, `%${value}%`);
    case 'startsWith':
      return ilike(field, `${value}%`);
    case 'endsWith':
      return ilike(field, `%${value}`);
    case 'isEmpty':
      return or(isNull(field), eq(field, ''));
    case 'isNotEmpty':
      return and(isNotNull(field), ne(field, ''));
  }
}

function buildEnumFilterCondition(
  field: typeof user.role,
  operator: EnumFilterOperator,
  value: string,
): SQL | undefined {
  const values = value.split(',').filter(Boolean);
  if (values.length === 0) return undefined;

  switch (operator) {
    case 'is':
      return eq(field, values[0]);
    case 'not':
      return ne(field, values[0]);
    case 'isAnyOf':
      return values.length === 1
        ? eq(field, values[0])
        : inArray(field, values);
  }
}

function buildBooleanFilterCondition(
  field: typeof user.banned | typeof user.emailSubscribed,
  operator: EnumFilterOperator,
  value: string,
): SQL | undefined {
  const boolValues = value
    .split(',')
    .filter(Boolean)
    .map((v) => v === 'true');
  if (boolValues.length === 0) return undefined;

  switch (operator) {
    case 'is':
      return eq(field, boolValues[0]);
    case 'not':
      return ne(field, boolValues[0]);
    case 'isAnyOf':
      if (boolValues.length >= 2) return undefined;
      return eq(field, boolValues[0]);
  }
}

function buildSearchCondition(
  field: typeof user.name | typeof user.email,
  operator: SearchOperator,
  value: string,
): SQL | undefined {
  switch (operator) {
    case 'contains':
      return ilike(field, `%${value}%`);
    case 'startsWith':
      return ilike(field, `${value}%`);
    case 'endsWith':
      return ilike(field, `%${value}`);
  }
}

function buildQuickFilterCondition(
  value: string,
  timezone: string,
): SQL | undefined {
  const parsedValue = parseQuickFilterValue(value);

  if (!parsedValue) {
    return or(
      ilike(user.name, `%${value}%`),
      ilike(user.email, `%${value}%`),
      ilike(
        sql`TO_CHAR(${user.createdAt} AT TIME ZONE 'UTC' AT TIME ZONE ${timezone}, 'YYYY-MM-DD HH24:MI:SS')`,
        `%${value}%`,
      ),
    );
  }

  switch (parsedValue.field) {
    case 'role':
      return eq(user.role, parsedValue.value);
    case 'banned':
      return eq(user.banned, parsedValue.value === 'true');
    case 'emailSubscribed':
      return eq(user.emailSubscribed, parsedValue.value === 'true');
  }
}

function buildColumnFilterCondition(
  filterField: NonNullable<ListUsersQueryDto['filterField']>,
  filterOperator: NonNullable<ListUsersQueryDto['filterOperator']>,
  filterValue: string | undefined,
): SQL | undefined {
  const isEnumOp = (ENUM_FILTER_OPERATORS as readonly string[]).includes(
    filterOperator,
  );

  if ((STRING_FILTER_FIELDS as readonly string[]).includes(filterField)) {
    if (isEnumOp) return undefined;
    if (!filterValue && !NO_VALUE_OPERATORS.includes(filterOperator))
      return undefined;
    return buildStringFilterCondition(
      user[filterField as StringFilterField],
      filterOperator as TextFilterOperator,
      filterValue ?? '',
    );
  }

  if (!isEnumOp || !filterValue) return undefined;

  if ((ENUM_FILTER_FIELDS as readonly string[]).includes(filterField)) {
    return buildEnumFilterCondition(
      user[filterField as EnumFilterField],
      filterOperator as EnumFilterOperator,
      filterValue,
    );
  }

  if ((BOOLEAN_FILTER_FIELDS as readonly string[]).includes(filterField)) {
    return buildBooleanFilterCondition(
      user[filterField as BooleanFilterField],
      filterOperator as EnumFilterOperator,
      filterValue,
    );
  }
}

@Injectable()
export class UsersService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async user(where: Partial<User>): Promise<User | null> {
    const result = await this.db.query.user.findFirst({
      where: (user) => {
        const conditions = Object.entries(where)
          .filter(([, value]) => value !== undefined)
          .map(([key, value]) => eq(user[key as keyof User], value!));
        return and(...conditions);
      },
    });
    return result || null;
  }

  async users(params: {
    offset?: number;
    limit?: number;
    cursor?: { id: string };
    where?: SQL;
    orderBy?: SQL | SQL[];
  }): Promise<User[]> {
    const { offset, limit, cursor, where, orderBy } = params;
    return await this.db.query.user.findMany({
      where: (user) =>
        and(where, cursor?.id ? gte(user.id, cursor.id) : undefined),
      orderBy,
      limit,
      offset,
    });
  }

  async listUsers(
    query: ListUsersQueryDto,
  ): Promise<{ data: User[]; total: number }> {
    const {
      limit = 10,
      offset = 0,
      sortBy = 'createdAt',
      sortDirection = 'desc',
      quickFilterValue,
      filterField,
      filterOperator,
      filterValue,
      searchField,
      searchOperator,
      searchValue,
      timezone = 'UTC',
    } = query;

    const quickFilterCondition = quickFilterValue
      ? buildQuickFilterCondition(quickFilterValue, String(timezone))
      : undefined;

    const columnFilterCondition =
      filterField && filterOperator
        ? buildColumnFilterCondition(filterField, filterOperator, filterValue)
        : undefined;

    const searchCondition =
      searchField && searchOperator && searchValue
        ? buildSearchCondition(user[searchField], searchOperator, searchValue)
        : undefined;

    const where = and(
      quickFilterCondition,
      columnFilterCondition,
      searchCondition,
    );

    const orderBy =
      sortDirection === 'asc' ? asc(user[sortBy]) : desc(user[sortBy]);

    const [data, [{ total }]] = await Promise.all([
      this.db
        .select()
        .from(user)
        .where(where)
        .orderBy(orderBy)
        .limit(limit)
        .offset(offset),
      this.db.select({ total: count() }).from(user).where(where),
    ]);

    return { data, total };
  }

  async createUser(data: CreateUser): Promise<User> {
    const results = await this.db.insert(schema.user).values(data).returning();
    return results[0];
  }

  async updateUser(params: {
    where: { id: string };
    data: UpdateUserDto;
  }): Promise<User> {
    const { where, data } = params;
    const [user] = await this.db
      .update(schema.user)
      .set(data)
      .where(eq(schema.user.id, where.id))
      .returning();

    return user;
  }

  async deleteUser(where: { id: string }): Promise<User> {
    const [user] = await this.db
      .delete(schema.user)
      .where(eq(schema.user.id, where.id))
      .returning();

    return user;
  }
}

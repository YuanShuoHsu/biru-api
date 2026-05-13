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

import type { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UpdateUserDto } from './dto/update-user.dto';

type StringField = typeof user.name | typeof user.email;
type QuickFilterField = 'role' | 'banned' | 'emailSubscribed';

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

function buildFilterCondition(
  field: StringField,
  operator: NonNullable<ListUsersQueryDto['filterOperator']>,
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

function buildSearchCondition(
  field: StringField,
  operator: NonNullable<ListUsersQueryDto['searchOperator']>,
  value: string,
): SQL | undefined {
  switch (operator) {
    case 'contains':
      return ilike(field, `%${value}%`);
    case 'starts_with':
      return ilike(field, `${value}%`);
    case 'ends_with':
      return ilike(field, `%${value}`);
  }
}

function buildQuickFilterCondition(value: string): SQL | undefined {
  const parsedValue = parseQuickFilterValue(value);

  if (!parsedValue) {
    return or(
      ilike(user.name, `%${value}%`),
      ilike(user.email, `%${value}%`),
      ilike(
        sql`TO_CHAR(${user.createdAt} AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Taipei', 'YYYY-MM-DD HH24:MI:SS')`,
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
    } = query;

    const quickFilterCondition = quickFilterValue
      ? buildQuickFilterCondition(quickFilterValue)
      : undefined;

    const columnFilterCondition =
      filterField &&
      filterOperator &&
      (filterValue || NO_VALUE_OPERATORS.includes(filterOperator))
        ? buildFilterCondition(
            user[filterField],
            filterOperator,
            filterValue || '',
          )
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

import { Inject, Injectable } from '@nestjs/common';

import {
  SQL,
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  lt,
  lte,
  ne,
  notInArray,
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

function buildFilterCondition(
  field: StringField,
  operator: NonNullable<ListUsersQueryDto['filterOperator']>,
  value: string,
): SQL | undefined {
  const values = value.split(',').map((v) => v.trim());

  switch (operator) {
    case 'eq':
      return eq(field, value);
    case 'ne':
      return ne(field, value);
    case 'lt':
      return lt(field, value);
    case 'lte':
      return lte(field, value);
    case 'gt':
      return gt(field, value);
    case 'gte':
      return gte(field, value);
    case 'in':
      return inArray(field, values);
    case 'not_in':
      return notInArray(field, values);
    case 'contains':
      return ilike(field, `%${value}%`);
    case 'starts_with':
      return ilike(field, `${value}%`);
    case 'ends_with':
      return ilike(field, `%${value}`);
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
      ? or(
          ilike(user.name, `%${quickFilterValue}%`),
          ilike(user.email, `%${quickFilterValue}%`),
          ilike(sql`${user.createdAt}::text`, `%${quickFilterValue}%`),
          eq(user.role, quickFilterValue),
          eq(sql`${user.banned}::text`, quickFilterValue),
          eq(sql`${user.emailSubscribed}::text`, quickFilterValue),
        )
      : undefined;

    const columnFilterCondition =
      filterField && filterOperator && filterValue
        ? buildFilterCondition(user[filterField], filterOperator, filterValue)
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

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
  lt,
  ne,
  or,
  sql,
} from 'drizzle-orm';
import {
  buildDateFilterCondition,
  buildFilterCondition,
  buildQuickFilterCondition,
  buildStringFilterCondition,
  localTimeText,
  NO_VALUE_OPERATORS,
} from '../common/utils/data-grid-filters.js';
import { getDeletableUserIds } from '../auth/deletion-guards.js';
import type { StatsBucketQueryDto } from '../common/dto/stats-bucket-query.dto.js';
import {
  getStatsWindow,
  utcTimestampParam,
} from '../common/utils/stats-buckets.js';
import * as schema from '../db/schema/index.js';
import type { CreateUser, User, UserRole } from '../db/schema/users.js';
import { user, userRoles } from '../db/schema/users.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import { DRIZZLE } from '../drizzle/drizzle.module.js';

import type {
  BooleanFilterField,
  DateFilterField,
  DateFilterOperator,
  EnumFilterField,
  EnumFilterOperator,
  ListUsersQueryDto,
  SearchOperator,
  StringFilterField,
  TextFilterOperator,
} from './dto/list-users-query.dto.js';
import {
  BOOLEAN_FILTER_FIELDS,
  DATE_FILTER_FIELDS,
  ENUM_FILTER_FIELDS,
  ENUM_FILTER_OPERATORS,
  STRING_FILTER_FIELDS,
} from './dto/list-users-query.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import type { UserListResponseDto } from './dto/user-response.dto.js';
import {
  USER_SESSION_DATE_FILTER_FIELDS,
  USER_SESSION_STRING_FILTER_FIELDS,
  type UserSessionPaginationQueryDto,
} from './dto/user-session-pagination-query.dto.js';
import type { UserSessionListResponseDto } from './dto/user-session-response.dto.js';
import type { UserStatsResponseDto } from './dto/user-stats.dto.js';

const buildEnumFilterCondition = (
  field: typeof user.role,
  operator: EnumFilterOperator,
  value: string,
): SQL | undefined => {
  const values = value
    .split(',')
    .filter((entry): entry is UserRole =>
      userRoles.includes(entry as UserRole),
    );
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
};

const buildBooleanFilterCondition = (
  field: typeof user.banned | typeof user.emailSubscribed,
  operator: EnumFilterOperator,
  value: string,
): SQL | undefined => {
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
};

const buildSearchCondition = (
  field: typeof user.name | typeof user.email,
  operator: SearchOperator,
  value: string,
): SQL | undefined => {
  switch (operator) {
    case 'contains':
      return ilike(field, `%${value}%`);
    case 'startsWith':
      return ilike(field, `${value}%`);
    case 'endsWith':
      return ilike(field, `%${value}`);
  }
};

// 快速搜尋的布林欄位可同時命中兩個標籤(已停權+使用中),兩者都要納入 OR
const buildBooleanQuickFilterCondition = (
  column: typeof user.banned | typeof user.emailSubscribed,
  value: string,
): SQL | undefined => {
  const values = value.split(',').filter(Boolean);

  return or(...values.map((entry) => eq(column, entry === 'true')));
};

const buildColumnFilterCondition = (
  filterField: NonNullable<ListUsersQueryDto['filterField']>,
  filterOperator: NonNullable<ListUsersQueryDto['filterOperator']>,
  filterValue: string | undefined,
): SQL | undefined => {
  const isEnumOp = (ENUM_FILTER_OPERATORS as readonly string[]).includes(
    filterOperator,
  );

  if ((STRING_FILTER_FIELDS as readonly string[]).includes(filterField)) {
    if (isEnumOp && filterOperator !== 'isAnyOf') return undefined;
    if (!filterValue && !NO_VALUE_OPERATORS.includes(filterOperator))
      return undefined;

    return buildStringFilterCondition(
      user[filterField as StringFilterField],
      filterOperator as TextFilterOperator,
      filterValue ?? '',
    );
  }

  if ((DATE_FILTER_FIELDS as readonly string[]).includes(filterField)) {
    return buildDateFilterCondition(
      user[filterField as DateFilterField],
      filterOperator as DateFilterOperator,
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
};

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

  async listUsers(query: ListUsersQueryDto): Promise<UserListResponseDto> {
    const {
      limit = 10,
      offset = 0,
      sortBy = 'createdAt',
      sortDirection = 'desc',
      quickFilterEnums,
      quickFilterValue,
      filterField,
      filterOperator,
      filterValue,
      searchField,
      searchOperator,
      searchValue,
    } = query;

    const quickFilterCondition = buildQuickFilterCondition({
      customConditions: {
        banned: (value) => buildBooleanQuickFilterCondition(user.banned, value),
        emailSubscribed: (value) =>
          buildBooleanQuickFilterCondition(user.emailSubscribed, value),
        role: (value) => buildEnumFilterCondition(user.role, 'isAnyOf', value),
      },
      fieldMap: {},
      quickFilterEnums,
      quickFilterValue,
      textConditions: (value) => [
        ilike(user.name, `%${value}%`),
        ilike(user.bio, `%${value}%`),
        ilike(user.email, `%${value}%`),
        ilike(localTimeText(user.createdAt), `%${value}%`),
      ],
    });

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

    const userIds = data.map(({ id }) => id);
    const [sessions, deletableUserIds] = await Promise.all([
      userIds.length
        ? this.db
            .selectDistinct({ userId: schema.session.userId })
            .from(schema.session)
            .where(inArray(schema.session.userId, userIds))
        : [],
      getDeletableUserIds(userIds),
    ]);
    const sessionUserIds = new Set(sessions.map(({ userId }) => userId));

    return {
      data: data.map((row) => ({
        ...row,
        deletable: deletableUserIds.has(row.id),
        hasSession: sessionUserIds.has(row.id),
      })),
      total,
    };
  }

  async listUserSessions(
    userId: string,
    query: UserSessionPaginationQueryDto,
  ): Promise<UserSessionListResponseDto> {
    const {
      limit = 10,
      offset = 0,
      filterField,
      filterOperator,
      filterValue,
      quickFilterEnums,
      quickFilterValue,
      sortBy = 'createdAt',
      sortDirection = 'desc',
    } = query;

    const { session } = schema;

    const fieldMap = {
      userAgent: session.userAgent,
      ipAddress: session.ipAddress,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
    };

    const where = and(
      eq(session.userId, userId),
      filterField && filterOperator
        ? buildFilterCondition(
            filterField,
            filterOperator,
            filterValue,
            fieldMap,
            USER_SESSION_STRING_FILTER_FIELDS,
            USER_SESSION_DATE_FILTER_FIELDS,
          )
        : undefined,
      buildQuickFilterCondition({
        fieldMap,
        quickFilterEnums,
        quickFilterValue,
        textConditions: (value) => [
          ilike(session.userAgent, `%${value}%`),
          ilike(session.ipAddress, `%${value}%`),
          ilike(localTimeText(session.createdAt), `%${value}%`),
          ilike(localTimeText(session.expiresAt), `%${value}%`),
        ],
      }),
    );

    const dir = sortDirection === 'asc' ? asc : desc;

    const [data, [{ total }]] = await Promise.all([
      this.db
        .select({
          id: session.id,
          ipAddress: session.ipAddress,
          userAgent: session.userAgent,
          createdAt: session.createdAt,
          expiresAt: session.expiresAt,
        })
        .from(session)
        .where(where)
        .orderBy(dir(fieldMap[sortBy]), desc(session.id))
        .limit(limit)
        .offset(offset),
      this.db.select({ total: count() }).from(session).where(where),
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
    const {
      where,
      data: { lastName, phoneNumber, ...data },
    } = params;
    const [user] = await this.db
      .update(schema.user)
      .set({
        ...data,
        ...(lastName !== undefined && { lastName: lastName || null }),
        ...(phoneNumber !== undefined && {
          phoneNumber: phoneNumber || null,
          phoneNumberVerified: false,
        }),
      })
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

  async getStats(query: StatsBucketQueryDto): Promise<UserStatsResponseDto> {
    const { bucketIndexOf, bucketStarts, previousSince, since, until } =
      getStatsWindow(query);
    const createdIn = (from: Date, to: Date) =>
      and(
        gte(user.createdAt, utcTimestampParam(from)),
        lt(user.createdAt, utcTimestampParam(to)),
      );

    const [[{ total }], bucketRows, [{ previous }]] = await Promise.all([
      this.db.select({ total: count() }).from(user),
      this.db
        .select({ index: bucketIndexOf(user.createdAt), users: count() })
        .from(user)
        .where(createdIn(since, until))
        .groupBy(sql`1`),
      this.db
        .select({ previous: count() })
        .from(user)
        .where(createdIn(previousSince, since)),
    ]);

    const usersByIndex = new Map(
      bucketRows.map(({ index, users }) => [index, users]),
    );

    return {
      total,
      buckets: bucketStarts.map((start, index) => ({
        start,
        users: usersByIndex.get(index) ?? 0,
      })),
      previous,
    };
  }
}

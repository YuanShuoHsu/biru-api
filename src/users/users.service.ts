import { Inject, Injectable } from '@nestjs/common';

import { and, eq, gte, SQL } from 'drizzle-orm';
import * as schema from 'src/db/schema';
import type { CreateUser, User } from 'src/db/schema/users';
import type { DrizzleDB } from 'src/drizzle/drizzle.module';
import { DRIZZLE } from 'src/drizzle/drizzle.module';

import { UpdateUserDto } from './dto/update-user.dto';

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

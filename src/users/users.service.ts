import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { AuthService } from '@thallesp/nestjs-better-auth';

import { and, eq, gte, SQL } from 'drizzle-orm';
import { I18nService } from 'nestjs-i18n';
import type { Auth } from 'src/auth';
import * as schema from 'src/db/schema';
import type { CreateUser, LangEnum, User } from 'src/db/schema/users';
import type { DrizzleDB } from 'src/drizzle/drizzle.module';
import { DRIZZLE } from 'src/drizzle/drizzle.module';

import { VerifyEmailDto } from 'src/users/dto/verify-email.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';

@Injectable()
export class UsersService {
  constructor(
    private authService: AuthService<Auth>,
    private i18n: I18nService,
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
  ) {}

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

  async createUserWithPassword(
    {
      // birthDate,
      email,
      emailSubscribed,
      firstName,
      // gender,
      image,
      lastName,
      password,
      // phoneNumber,
      redirectTo,
    }: CreateUserDto,
    lang: LangEnum,
    headers: Headers,
  ): Promise<UserResponseDto> {
    const existingEmail = await this.user({ email });
    if (existingEmail)
      throw new ConflictException(this.i18n.t('users.emailAlreadyExists'));

    const res = await this.authService.api.signUpEmail({
      body: {
        // birthDate,
        callbackURL: redirectTo,
        email,
        emailSubscribed,
        firstName,
        // gender,
        image,
        lang,
        lastName,
        name: [firstName, lastName].filter(Boolean).join(' '),
        password,
        // phoneNumber,
      },
      headers,
    });

    return res.user;
  }

  async verifyEmail({ token }: VerifyEmailDto) {
    return await this.authService.api.verifyEmail({
      query: { token },
    });
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

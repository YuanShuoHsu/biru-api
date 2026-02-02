import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, SQL } from 'drizzle-orm';

import { randomUUID } from 'crypto';
import { I18nService } from 'nestjs-i18n';
import { normalizeEmail } from 'src/common/utils/email';
import { hash } from 'src/common/utils/hashing';
import * as schema from 'src/db/schema';
import type { DrizzleDB } from 'src/drizzle/drizzle.module';
import { DRIZZLE } from 'src/drizzle/drizzle.module';
import { MailsService } from 'src/mails/mails.service';

import { RoleEnum } from 'src/common/enums/user';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

type User = typeof schema.user.$inferSelect;
type CreateUser = typeof schema.user.$inferInsert;

@Injectable()
export class UsersService {
  constructor(
    private i18n: I18nService,
    private mailsService: MailsService,
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
  ) {}

  async user(params: { id?: string; email?: string }): Promise<User | null> {
    const { id, email } = params;
    const result = await this.db.query.user.findFirst({
      where: (user) =>
        and(
          id ? eq(user.id, id) : undefined,
          email ? eq(user.email, email) : undefined,
        ),
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
    { email, password, phoneNumber, redirect, ...rest }: CreateUserDto,
    userAgent: string,
  ): Promise<User> {
    const normalizedEmail = normalizeEmail(email);
    const hashedPassword = await hash(password);

    const emailExists = await this.user({ email: normalizedEmail });
    if (emailExists)
      throw new ConflictException(this.i18n.t('users.emailAlreadyExists'));

    const phoneExistsResult = await this.db.query.user.findFirst({
      where: eq(schema.user.phoneNumber, phoneNumber || ''),
    });

    if (phoneExistsResult)
      throw new ConflictException(
        this.i18n.t('users.phoneNumberAlreadyExists'),
      );

    const user = await this.db.transaction(async (tx) => {
      const [newUser] = await tx
        .insert(schema.user)
        .values({
          birthDate: rest.birthDate,
          createdAt: new Date(),
          email: normalizedEmail,
          emailSubscribed: rest.emailSubscribed,
          emailVerified: false,
          firstName: rest.firstName,
          gender: rest.gender,
          image: rest.image,
          lastName: rest.lastName,
          name: `${rest.firstName} ${rest.lastName || ''}`.trim(),
          phoneNumber,
          phoneVerified: false,
          role: RoleEnum.USER,
          updatedAt: new Date(),
        })
        .returning();

      await tx.insert(schema.account).values({
        accountId: normalizedEmail,
        password: hashedPassword,
        providerId: 'LOCAL',
        userId: newUser.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      return newUser;
    });

    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await this.db
      .delete(schema.verification)
      .where(eq(schema.verification.identifier, user.id));

    await this.db.insert(schema.verification).values({
      expiresAt,
      identifier: user.id,
      value: token,
    });

    await this.mailsService.sendEmail(user, token, userAgent, redirect);

    return user;
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

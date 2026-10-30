import { BadRequestException, NotFoundException } from '@nestjs/common';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';

import { UsersService } from './users.service.js';

describe('UsersService', () => {
  let client: PGlite;
  let service: UsersService;

  beforeAll(async () => {
    client = createPGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new UsersService(db as unknown as DrizzleDB);
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  it('更新不存在的使用者回 404', async () => {
    await expect(
      service.updateUser({
        where: { id: 'missing' },
        data: { firstName: 'A' },
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('刪除不存在的使用者回 404', async () => {
    await expect(service.deleteUser({ id: 'missing' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('更新與刪除既有的使用者回傳該使用者', async () => {
    const { id } = await service.createUser({
      id: 'user-1',
      name: 'Biru',
      email: 'user-1@example.com',
      firstName: 'Coffee',
    });

    await expect(
      service.updateUser({ where: { id }, data: { firstName: 'Tea' } }),
    ).resolves.toMatchObject({ id, firstName: 'Tea' });
    await expect(service.deleteUser({ id })).resolves.toMatchObject({ id });
  });
});

describe('UsersService.updateUser', () => {
  let client: PGlite;
  let service: UsersService;

  beforeAll(async () => {
    client = createPGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new UsersService(db as unknown as DrizzleDB);

    await client.query(
      `insert into "user" (id, name, email, updated_at, first_name, phone_number) values
        ('ann', 'Ann', 'ann@example.com', now(), 'Ann', '+886911111111'),
        ('bo', 'Bo', 'bo@example.com', now(), 'Bo', '+886922222222')`,
    );
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  it('電話和別人重複時回 400 與錯誤碼', async () => {
    const error: unknown = await service
      .updateUser({
        where: { id: 'bo' },
        data: { phoneNumber: '+886911111111' },
      })
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      code: 'PHONE_NUMBER_ALREADY_EXISTS',
    });
  });

  it('存回自己原本的電話不算重複', async () => {
    await expect(
      service.updateUser({
        where: { id: 'bo' },
        data: { phoneNumber: '+886922222222' },
      }),
    ).resolves.toMatchObject({ phoneNumber: '+886922222222' });
  });

  it('清空姓與電話存成 null', async () => {
    await expect(
      service.updateUser({
        where: { id: 'bo' },
        data: { lastName: ' ', phoneNumber: '' },
      }),
    ).resolves.toMatchObject({ lastName: null, phoneNumber: null });
  });
});

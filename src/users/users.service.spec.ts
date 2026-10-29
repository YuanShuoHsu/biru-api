import { NotFoundException } from '@nestjs/common';

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

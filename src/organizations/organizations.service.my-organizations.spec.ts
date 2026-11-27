import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import { createPGlite } from '../../test/pglite.js';
import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';

import { OrganizationsService } from './organizations.service.js';

vi.mock('../auth/deletion-guards.js', () => ({
  getDeletableOrganizationIds: (ids: string[]) => Promise.resolve(new Set(ids)),
}));

describe('OrganizationsService.myOrganizations', () => {
  let client: PGlite;
  let service: OrganizationsService;

  beforeAll(async () => {
    client = createPGlite();
    const pglite = drizzle(client, { schema });
    await migrate(pglite, { migrationsFolder: './drizzle' });
    service = new OrganizationsService(pglite as unknown as DrizzleDB);
    await client.exec(`
      insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values
        ('biru', 'Biru', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段'),
        ('own', 'Own', 'own', now() + interval '1 second', 'TW', '桃園市', '大園區', '中正東路一段'),
        ('other', 'Other', 'other', now(), 'TW', '桃園市', '大園區', '中正東路一段');
      insert into "user" (id, name, email, first_name, role) values
        ('root', 'root', 'root@example.com', 'Root', 'admin');
      insert into member (id, organization_id, user_id, role, joined_as_platform_admin, created_at) values
        ('m-biru', 'biru', 'root', 'owner', true, now()),
        ('m-own', 'own', 'root', 'owner', false, now());
    `);
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  it('標出以平台管理員身分加入的門市，沒加入的門市不列出', async () => {
    const rows = await service.myOrganizations('root');

    expect(
      rows.map(({ id, joinedAsPlatformAdmin }) => ({
        id,
        joinedAsPlatformAdmin,
      })),
    ).toEqual([
      { id: 'own', joinedAsPlatformAdmin: false },
      { id: 'biru', joinedAsPlatformAdmin: true },
    ]);
  });
});

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import type { I18nService } from 'nestjs-i18n';

import * as schema from '../db/schema/index.js';
import { banner } from '../db/schema/banners.js';
import { deletedRecord } from '../db/schema/deleted-records.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';

import { DeletedRecordsService } from './deleted-records.service.js';

describe('DeletedRecordsService.restore', () => {
  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: DeletedRecordsService;

  beforeAll(async () => {
    client = new PGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new DeletedRecordsService(
      db as unknown as DrizzleDB,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { emit: vi.fn() } as unknown as EventEmitter2,
      {} as I18nService,
      {} as never,
    );
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  it('還原 commit 後才失敗的異動紀錄不會讓請求失敗', async () => {
    await db.insert(banner).values({ id: 'b1', image: 'banner' });
    await db.delete(banner);
    const [{ batchId }] = await db.select().from(deletedRecord);
    vi.spyOn(
      service as unknown as { resolveOrganizationId: () => Promise<never> },
      'resolveOrganizationId',
    ).mockRejectedValue(new Error('lookup failed'));

    await expect(
      service.restore([batchId], {
        id: 'admin',
        name: 'admin',
        email: 'admin@example.com',
      }),
    ).resolves.toBeUndefined();
    expect(await db.select({ id: banner.id }).from(banner)).toEqual([
      { id: 'b1' },
    ]);
  });
});

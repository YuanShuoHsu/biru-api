import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

import type { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { I18nService } from 'nestjs-i18n';

import { createPGlite } from '../../test/pglite.js';
import { DAY_MS, platformDateString } from '../common/constants/timezone.js';
import * as schema from '../db/schema/index.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import type { I18nTranslations } from '../generated/i18n.generated.js';

import { SpecialHoursService } from './special-hours.service.js';

const day = (offset: number) =>
  platformDateString(new Date(Date.now() + offset * DAY_MS));

describe('SpecialHoursService', () => {
  let client: PGlite;
  let service: SpecialHoursService;

  beforeAll(async () => {
    client = createPGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new SpecialHoursService(
      db as unknown as DrizzleDB,
      { t: (key: string) => key } as unknown as I18nService<I18nTranslations>,
    );
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await client.exec(`
      truncate organization cascade;
      insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values
        ('biru', 'Biru', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段'),
        ('cafe', 'Cafe', 'cafe', now(), 'TW', '桃園市', '大園區', '中正東路一段');
    `);
  });

  it('新增後列出今天以後的特殊營業日，已結束的不列', async () => {
    await client.exec(`
      insert into organization_special_hours (id, organization_id, valid_from, valid_through)
      values ('past', 'biru', '${day(-3)}', '${day(-1)}')
    `);

    const created = await service.create('biru', {
      validFrom: day(0),
      validThrough: day(2),
      openingHours: null,
      note: '颱風停業',
    });

    expect(created).toMatchObject({
      organizationId: 'biru',
      validFrom: day(0),
      validThrough: day(2),
      openingHours: null,
      note: '颱風停業',
    });
    await expect(service.findUpcoming('biru')).resolves.toEqual([created]);
  });

  it('和既有區間重疊時回 409 並附上衝突那筆', async () => {
    const existing = await service.create('biru', {
      validFrom: day(5),
      validThrough: day(7),
      openingHours: 'Mo-Su 10:00-15:00',
    });

    const error = await service
      .create('biru', {
        validFrom: day(7),
        validThrough: day(9),
        openingHours: null,
      })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      message: 'common.organizations.specialHoursOverlap',
      conflict: existing,
    });
  });

  it('更新成和另一筆重疊時回 409，只改自己時不算重疊', async () => {
    const first = await service.create('biru', {
      validFrom: day(1),
      validThrough: day(2),
      openingHours: null,
    });
    const second = await service.create('biru', {
      validFrom: day(4),
      validThrough: day(5),
      openingHours: null,
    });

    await expect(
      service.update('biru', second.id, { validFrom: day(2) }),
    ).rejects.toBeInstanceOf(ConflictException);
    await expect(
      service.update('biru', first.id, { validThrough: day(3), note: '延長' }),
    ).resolves.toMatchObject({ validThrough: day(3), note: '延長' });
  });

  it('不能新增或改成已結束的區間，也不能讓開始晚於結束', async () => {
    await expect(
      service.create('biru', {
        validFrom: day(-2),
        validThrough: day(-1),
        openingHours: null,
      }),
    ).rejects.toThrow(
      new BadRequestException('common.organizations.specialHoursEnded'),
    );
    await expect(
      service.create('biru', {
        validFrom: day(3),
        validThrough: day(2),
        openingHours: null,
      }),
    ).rejects.toThrow(
      new BadRequestException('common.organizations.specialHoursInvalidRange'),
    );

    const created = await service.create('biru', {
      validFrom: day(0),
      validThrough: day(1),
      openingHours: null,
    });
    await expect(
      service.update('biru', created.id, {
        validFrom: day(-2),
        validThrough: day(-1),
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('刪除後不再列出，刪除時留下可追溯的紀錄', async () => {
    const created = await service.create('biru', {
      validFrom: day(1),
      validThrough: day(1),
      openingHours: null,
    });

    await service.remove('biru', created.id);

    await expect(service.findUpcoming('biru')).resolves.toEqual([]);
    const { rows } = await client.query(
      `select 1 from deleted_record where table_name = 'organization_special_hours'`,
    );
    expect(rows).toHaveLength(1);
  });

  it('不同門市的區間互不影響，也不能用別家門市改或刪', async () => {
    const biru = await service.create('biru', {
      validFrom: day(1),
      validThrough: day(3),
      openingHours: null,
    });
    await expect(
      service.create('cafe', {
        validFrom: day(1),
        validThrough: day(3),
        openingHours: null,
      }),
    ).resolves.toMatchObject({ organizationId: 'cafe' });

    await expect(service.findUpcoming('cafe')).resolves.toHaveLength(1);
    await expect(
      service.update('cafe', biru.id, { note: '改別家' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.remove('cafe', biru.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.findUpcoming('biru')).resolves.toEqual([biru]);
  });
});

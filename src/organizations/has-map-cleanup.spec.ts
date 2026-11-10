import { readFileSync } from 'node:fs';

import type { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

import * as schema from '../db/schema/index.js';

import { createPGlite } from '../../test/pglite.js';

const cleanup = readFileSync(
  './drizzle/0270_clear_non_embed_store_maps.sql',
  'utf8',
);

describe('清掉不是 Google 地圖嵌入網址的門市地圖連結', () => {
  let client: PGlite;

  beforeAll(async () => {
    client = createPGlite();
    await migrate(drizzle(client, { schema }), {
      migrationsFolder: './drizzle',
    });

    await client.exec(`
      insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address, has_map) values
        ('embed', 'Embed', 'embed', now(), 'TW', '桃園市', '大園區', '中正東路一段', 'https://www.google.com/maps/embed?pb=!1m18!1m12'),
        ('embed-api', 'Embed API', 'embed-api', now(), 'TW', '桃園市', '大園區', '中正東路一段', 'https://www.google.com/maps/embed/v1/place?key=KEY&q=Biru'),
        ('uppercase', 'Uppercase', 'uppercase', now(), 'TW', '桃園市', '大園區', '中正東路一段', 'HTTPS://WWW.GOOGLE.COM/maps/embed?pb=!1m18'),
        ('share', 'Share', 'share', now(), 'TW', '桃園市', '大園區', '中正東路一段', 'https://maps.app.goo.gl/abc'),
        ('other', 'Other', 'other', now(), 'TW', '桃園市', '大園區', '中正東路一段', 'https://evil.example.com/maps/embed?pb=1'),
        ('script', 'Script', 'script', now(), 'TW', '桃園市', '大園區', '中正東路一段', 'javascript:alert(1)'),
        ('blank', 'Blank', 'blank', now(), 'TW', '桃園市', '大園區', '中正東路一段', ''),
        ('none', 'None', 'none', now(), 'TW', '桃園市', '大園區', '中正東路一段', null);
    `);
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  it('只保留 Google 地圖嵌入網址', async () => {
    await client.exec(cleanup);

    const { rows } = await client.query(
      'select id, has_map from organization order by id',
    );
    expect(rows).toEqual([
      { id: 'blank', has_map: null },
      {
        id: 'embed',
        has_map: 'https://www.google.com/maps/embed?pb=!1m18!1m12',
      },
      {
        id: 'embed-api',
        has_map: 'https://www.google.com/maps/embed/v1/place?key=KEY&q=Biru',
      },
      { id: 'none', has_map: null },
      { id: 'other', has_map: null },
      { id: 'script', has_map: null },
      { id: 'share', has_map: null },
      {
        id: 'uppercase',
        has_map: 'HTTPS://WWW.GOOGLE.COM/maps/embed?pb=!1m18',
      },
    ]);
  });
});

import { ConfigService } from '@nestjs/config';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '../src/db/index.js';
import { organization, user } from '../src/db/schema/index.js';
import { ImageStorageService } from '../src/images/image-storage.service.js';
import { IMAGE_TABLES } from '../src/images/images.service.js';
import { parseImageDataUrl, type ImageKind } from '../src/images/image-url.js';

const apply = process.argv.includes('--apply');

const imageSources = [
  ...(
    Object.entries(IMAGE_TABLES) as [
      ImageKind,
      (typeof IMAGE_TABLES)[ImageKind],
    ][]
  ).map(([kind, table]) => ({
    kind,
    table,
    id: table.id,
    image: table.image,
    replace: (id: string, from: string, image: string) =>
      db
        .update(table)
        .set({ image, updatedAt: sql`${table.updatedAt}` })
        .where(and(eq(table.id, id), eq(table.image, from)))
        .returning({ id: table.id }),
  })),
  {
    kind: 'user' as const,
    table: user,
    id: user.id,
    image: user.image,
    replace: (id: string, from: string, image: string) =>
      db
        .update(user)
        .set({ image, updatedAt: sql`${user.updatedAt}` })
        .where(and(eq(user.id, id), eq(user.image, from)))
        .returning({ id: user.id }),
  },
  {
    kind: 'organization' as const,
    table: organization,
    id: organization.id,
    image: organization.logo,
    replace: (id: string, from: string, logo: string) =>
      db
        .update(organization)
        .set({ logo })
        .where(and(eq(organization.id, id), eq(organization.logo, from)))
        .returning({ id: organization.id }),
  },
];

async function main() {
  const imageStorage = new ImageStorageService(new ConfigService());

  for (const { kind, table, id: idColumn, image, replace } of imageSources) {
    const isDataUrl = sql`starts_with(${image}, 'data:')`;
    const rows = await db
      .select({
        id: idColumn,
        bytes: sql<number>`octet_length(${image})`.mapWith(Number),
      })
      .from(table)
      .where(isDataUrl);
    const bytes = rows.reduce((sum, row) => sum + row.bytes, 0);
    console.log(`${kind}: ${rows.length} data URL images, ${bytes} bytes`);
    if (!apply) continue;

    let moved = 0;
    let skipped = 0;
    for (const { id } of rows) {
      const [row] = await db
        .select({ image })
        .from(table)
        .where(and(eq(idColumn, id), isDataUrl));
      if (!row?.image || !parseImageDataUrl(row.image)) {
        skipped++;
        continue;
      }

      const stored = await imageStorage.store(kind, row.image);
      if (!stored.startsWith('https://')) {
        throw new Error(
          '--apply needs all S3_* variables and an https S3_PUBLIC_URL',
        );
      }
      const updated = await replace(id, row.image, stored);
      if (updated.length > 0) moved++;
      else skipped++;
    }
    console.log(`${kind}: moved ${moved}, skipped ${skipped}`);
  }

  console.log(apply ? 'Done.' : 'Dry run; pass --apply to move them.');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$client.end());

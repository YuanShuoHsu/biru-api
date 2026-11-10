import { ConfigService } from '@nestjs/config';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '../src/db/index.js';
import { ImageStorageService } from '../src/images/image-storage.service.js';
import { IMAGE_TABLES } from '../src/images/images.service.js';
import { parseImageDataUrl, type ImageKind } from '../src/images/image-url.js';

const apply = process.argv.includes('--apply');

async function main() {
  const imageStorage = new ImageStorageService(new ConfigService());

  for (const [kind, table] of Object.entries(IMAGE_TABLES) as [
    ImageKind,
    (typeof IMAGE_TABLES)[ImageKind],
  ][]) {
    const isDataUrl = sql`starts_with(${table.image}, 'data:')`;
    const rows = await db
      .select({
        id: table.id,
        bytes: sql<number>`octet_length(${table.image})`.mapWith(Number),
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
        .select({ image: table.image })
        .from(table)
        .where(and(eq(table.id, id), isDataUrl));
      if (!row?.image || !parseImageDataUrl(row.image)) {
        skipped++;
        continue;
      }

      const image = await imageStorage.store(kind, row.image);
      if (!image.startsWith('https://')) {
        throw new Error(
          '--apply needs all S3_* variables and an https S3_PUBLIC_URL',
        );
      }
      const updated = await db
        .update(table)
        .set({ image, updatedAt: sql`${table.updatedAt}` })
        .where(and(eq(table.id, id), eq(table.image, row.image)))
        .returning({ id: table.id });
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

import { Inject, Injectable, Logger } from '@nestjs/common';

import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  type _Object,
} from '@aws-sdk/client-s3';
import { and, getTableName, inArray, sql } from 'drizzle-orm';

import { deletedRecord } from '../db/schema/deleted-records.js';
import { DRIZZLE, type DrizzleDB } from '../drizzle/drizzle.module.js';

import type { ImageOrphanSweepResponseDto } from './dto/image-orphan-sweep.dto.js';
import { ImageStorageService } from './image-storage.service.js';
import { IMAGE_KINDS } from './image-url.js';
import { IMAGE_TABLES } from './images.service.js';

const GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;
// https://docs.aws.amazon.com/AmazonS3/latest/API/API_DeleteObjects.html
const DELETE_BATCH_SIZE = 1000;

const keyOf = (url: string) =>
  new URL(url).pathname.split('/').slice(-2).join('/');

@Injectable()
export class ImageOrphansService {
  private readonly logger = new Logger(ImageOrphansService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly imageStorageService: ImageStorageService,
  ) {}

  async sweep(apply: boolean): Promise<ImageOrphanSweepResponseDto> {
    const { storage } = this.imageStorageService;
    if (!storage) return { applied: apply, kinds: [] };

    const referenced = await this.referencedKeys();
    const cutoff = Date.now() - GRACE_PERIOD_MS;
    const kinds: ImageOrphanSweepResponseDto['kinds'] = [];

    for (const kind of IMAGE_KINDS) {
      const objects: _Object[] = [];
      let continuationToken: string | undefined;
      do {
        const page = await storage.client.send(
          new ListObjectsV2Command({
            Bucket: storage.bucket,
            Prefix: `${kind}/`,
            ContinuationToken: continuationToken,
          }),
        );
        objects.push(...(page.Contents ?? []));
        continuationToken = page.NextContinuationToken;
      } while (continuationToken);

      const orphans = objects.flatMap(({ Key, LastModified }) =>
        Key &&
        !referenced.has(Key) &&
        LastModified &&
        LastModified.getTime() < cutoff
          ? [Key]
          : [],
      );

      const keys = apply ? await this.delete(orphans) : orphans;
      kinds.push({ kind, scanned: objects.length, count: keys.length, keys });
    }

    this.logger.log(
      `${apply ? 'Deleted' : 'Found'} ${kinds.reduce((sum, { count }) => sum + count, 0)} orphan images (${kinds.map(({ kind, count }) => `${kind}: ${count}`).join(', ')})`,
    );

    return { applied: apply, kinds };
  }

  private async referencedKeys() {
    const urls = await Promise.all([
      ...Object.values(IMAGE_TABLES).map((table) =>
        this.db
          .select({ image: table.image })
          .from(table)
          .where(sql`starts_with(${table.image}, 'https://')`),
      ),
      this.db
        .select({ image: sql<string>`${deletedRecord.data}->>'image'` })
        .from(deletedRecord)
        .where(
          and(
            inArray(
              deletedRecord.tableName,
              Object.values(IMAGE_TABLES).map((table) => getTableName(table)),
            ),
            sql`starts_with(${deletedRecord.data}->>'image', 'https://')`,
          ),
        ),
    ]);

    return new Set(
      urls.flat().flatMap(({ image }) => (image ? [keyOf(image)] : [])),
    );
  }

  private async delete(keys: string[]) {
    const { storage } = this.imageStorageService;
    const deleted: string[] = [];

    for (let i = 0; i < keys.length; i += DELETE_BATCH_SIZE) {
      const batch = keys.slice(i, i + DELETE_BATCH_SIZE);
      const { Errors = [] } = await storage!.client.send(
        new DeleteObjectsCommand({
          Bucket: storage!.bucket,
          Delete: {
            Objects: batch.map((Key) => ({ Key })),
            Quiet: true,
          },
        }),
      );

      if (Errors.length > 0) {
        this.logger.warn(
          `Failed to delete ${Errors.length} orphan images: ${Errors.map(({ Key, Code }) => `${Key} (${Code})`).join(', ')}`,
        );
      }

      const failed = new Set(Errors.map(({ Key }) => Key));
      deleted.push(...batch.filter((key) => !failed.has(key)));
    }

    return deleted;
  }
}

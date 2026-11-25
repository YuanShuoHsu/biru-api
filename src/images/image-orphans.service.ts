import { Inject, Injectable, Logger } from '@nestjs/common';

import type { _Object } from '@aws-sdk/client-s3';
import { and, getTableName, gte, inArray, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

import { auditLog } from '../db/schema/audit.js';
import { deletedRecord } from '../db/schema/deleted-records.js';
import { organization } from '../db/schema/organizations.js';
import { DRIZZLE, type DrizzleDB } from '../drizzle/drizzle.module.js';

import type { ImageOrphanSweepResponseDto } from './dto/image-orphan-sweep.dto.js';
import { ImageStorageService } from './image-storage.service.js';
import { IMAGE_KINDS, type SweptImageKind } from './image-url.js';
import { IMAGE_TABLES } from './images.service.js';

const GRACE_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;

const SWEPT_IMAGE_COLUMNS: { kind: SweptImageKind; column: AnyPgColumn }[] = [
  ...IMAGE_KINDS.map((kind) => ({ kind, column: IMAGE_TABLES[kind].image })),
  { kind: 'organization', column: organization.logo },
];

const keyOf = (url: string) =>
  URL.canParse(url)
    ? [new URL(url).pathname.split('/').slice(-2).join('/')]
    : [];

@Injectable()
export class ImageOrphansService {
  private readonly logger = new Logger(ImageOrphansService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly imageStorageService: ImageStorageService,
  ) {}

  async sweep(apply: boolean): Promise<ImageOrphanSweepResponseDto> {
    const listings: { kind: SweptImageKind; objects: _Object[] }[] = [];
    for (const { kind } of SWEPT_IMAGE_COLUMNS) {
      const objects = await this.imageStorageService.list(`${kind}/`);
      if (!objects) return { applied: apply, kinds: [] };
      listings.push({ kind, objects });
    }

    // 參照必須在列出物件之後才查：同內容重新上傳會覆寫同一個 key，先查參照會把剛寫入的參照漏掉
    const cutoff = new Date(Date.now() - GRACE_PERIOD_MS);
    const referenced = await this.referencedKeys(cutoff);
    const orphans = listings.map(({ kind, objects }) => ({
      kind,
      scanned: objects.length,
      keys: objects.flatMap(({ Key, LastModified }) =>
        Key &&
        !referenced.has(Key) &&
        LastModified &&
        LastModified.getTime() < cutoff.getTime()
          ? [Key]
          : [],
      ),
    }));

    const errors = apply
      ? await this.imageStorageService.delete(
          orphans.flatMap(({ keys }) => keys),
        )
      : [];
    if (errors.length > 0) {
      this.logger.warn(
        `刪除 ${errors.length} 個孤兒圖片失敗：${errors.map(({ Key, Code }) => `${Key} (${Code})`).join(', ')}`,
      );
    }

    const failed = new Set(errors.map(({ Key }) => Key));
    const kinds = orphans.map(({ kind, scanned, keys }) => {
      const remaining = keys.filter((key) => !failed.has(key));
      return { kind, scanned, count: remaining.length, keys: remaining };
    });

    this.logger.log(
      `${apply ? '已刪除' : '找到'} ${kinds.reduce((sum, { count }) => sum + count, 0)} 個孤兒圖片（${kinds.map(({ kind, count }) => `${kind} ${count}`).join('、')}）`,
    );

    return { applied: apply, kinds };
  }

  private async referencedKeys(replacedSince: Date) {
    const deletedImage = sql<string>`case ${sql.join(
      SWEPT_IMAGE_COLUMNS.map(
        ({ column }) =>
          sql`when ${deletedRecord.tableName} = ${getTableName(column.table)} then ${deletedRecord.data}->>${column.name}`,
      ),
      sql` `,
    )} end`;
    const replacedImage = sql<string>`case ${sql.join(
      SWEPT_IMAGE_COLUMNS.map(
        ({ kind, column }) =>
          sql`when ${auditLog.resource} = ${kind} then ${auditLog.changes}->${column.name}->>'before'`,
      ),
      sql` `,
    )} end`;

    const urls = await Promise.all([
      ...SWEPT_IMAGE_COLUMNS.map(({ column }) =>
        this.db
          .select({ image: sql<string>`${column}` })
          .from(column.table)
          .where(sql`starts_with(${column}, 'https://')`),
      ),
      this.db
        .select({ image: deletedImage })
        .from(deletedRecord)
        .where(
          and(
            inArray(
              deletedRecord.tableName,
              SWEPT_IMAGE_COLUMNS.map(({ column }) =>
                getTableName(column.table),
              ),
            ),
            sql`starts_with(${deletedImage}, 'https://')`,
          ),
        ),
      this.db
        .select({ image: replacedImage })
        .from(auditLog)
        .where(
          and(
            gte(auditLog.createdAt, replacedSince),
            inArray(
              auditLog.resource,
              SWEPT_IMAGE_COLUMNS.map(({ kind }) => kind),
            ),
            sql`starts_with(${replacedImage}, 'https://')`,
          ),
        ),
    ]);

    return new Set(
      urls.flat().flatMap(({ image }) => (image ? keyOf(image) : [])),
    );
  }
}

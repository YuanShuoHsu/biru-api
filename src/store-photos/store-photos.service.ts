import { randomUUID } from 'crypto';

import { Inject, Injectable } from '@nestjs/common';

import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  max,
  sql,
  type Column,
  type SQL,
} from 'drizzle-orm';
import { I18nContext } from 'nestjs-i18n';

import { toLanguage } from '../common/utils/language.js';
import { localizedTextSql } from '../common/utils/localized-text.js';
import { startDeletedRecordBatch } from '../deleted-records/request-batch.js';
import type { Language } from '../db/schema/enums.js';
import { storePhoto } from '../db/schema/store-photos.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import { DRIZZLE } from '../drizzle/drizzle.module.js';
import { localize } from '../menus/menus-public.service.js';

import {
  buildFilterCondition,
  buildLocalizedTextFilterCondition,
  buildQuickFilterCondition,
  localTimeText,
} from '../common/utils/data-grid-filters.js';

import type {
  CreateStorePhotoDto,
  UpdateStorePhotoDto,
} from './dto/create-store-photo.dto.js';
import {
  STORE_PHOTO_DATE_FILTER_FIELDS,
  STORE_PHOTO_ENUM_FILTER_FIELDS,
  STORE_PHOTO_STRING_FILTER_FIELDS,
  type StorePhotoPaginationQueryDto,
} from './dto/store-photo-pagination-query.dto.js';
import type { PublicStorePhotoResponseDto } from './dto/public-store-photo-response.dto.js';
import type { StorePhotoResponseDto } from './dto/store-photo-response.dto.js';
import { notFoundError } from './store-photo-errors.js';

@Injectable()
export class StorePhotosService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async findAllActive(lang: Language): Promise<PublicStorePhotoResponseDto[]> {
    const rows = await this.db.query.storePhoto.findMany({
      columns: { id: true, image: true, alt: true },
      where: eq(storePhoto.isActive, true),
      orderBy: [asc(storePhoto.sortOrder), asc(storePhoto.createdAt)],
    });

    return rows.map(({ alt, ...row }) => ({
      ...row,
      alt: localize(alt, lang) ?? '',
    }));
  }

  async findAll(
    query: StorePhotoPaginationQueryDto = {},
  ): Promise<{ data: StorePhotoResponseDto[]; total: number }> {
    const {
      limit = 10,
      offset = 0,
      filterField,
      filterOperator,
      filterValue,
      quickFilterEnums,
      quickFilterValue,
      sortBy,
      sortDirection = 'asc',
    } = query;

    const storePhotoFieldMap: Record<string, Column | SQL> = {
      isActive: sql`${storePhoto.isActive}::text`,
      createdAt: storePhoto.createdAt,
      updatedAt: storePhoto.updatedAt,
    };

    const dir = sortDirection === 'desc' ? desc : asc;
    const orderBy = sortBy
      ? [
          dir(
            sortBy === 'alt'
              ? localizedTextSql(
                  storePhoto.alt,
                  toLanguage(I18nContext.current()?.lang),
                )
              : storePhotoFieldMap[sortBy],
          ),
          asc(storePhoto.createdAt),
        ]
      : [asc(storePhoto.sortOrder), asc(storePhoto.createdAt)];

    const where = and(
      filterField === 'alt' && filterOperator
        ? buildLocalizedTextFilterCondition(
            storePhoto.alt,
            filterOperator,
            filterValue,
          )
        : filterField && filterOperator
          ? buildFilterCondition(
              filterField,
              filterOperator,
              filterValue,
              storePhotoFieldMap,
              STORE_PHOTO_STRING_FILTER_FIELDS,
              STORE_PHOTO_DATE_FILTER_FIELDS,
              STORE_PHOTO_ENUM_FILTER_FIELDS,
            )
          : undefined,
      buildQuickFilterCondition({
        enumFields: STORE_PHOTO_ENUM_FILTER_FIELDS,
        fieldMap: storePhotoFieldMap,
        quickFilterEnums,
        quickFilterValue,
        textConditions: (value) => [
          buildLocalizedTextFilterCondition(storePhoto.alt, 'contains', value),
          ilike(localTimeText(storePhoto.createdAt), `%${value}%`),
          ilike(localTimeText(storePhoto.updatedAt), `%${value}%`),
        ],
      }),
    );

    const [data, [{ total }]] = await Promise.all([
      this.db.query.storePhoto.findMany({ where, orderBy, limit, offset }),
      this.db.select({ total: count() }).from(storePhoto).where(where),
    ]);

    return { data, total };
  }

  async create(dto: CreateStorePhotoDto): Promise<StorePhotoResponseDto> {
    const [{ maxSortOrder }] = await this.db
      .select({ maxSortOrder: max(storePhoto.sortOrder) })
      .from(storePhoto);

    const [created] = await this.db
      .insert(storePhoto)
      .values({
        id: randomUUID(),
        image: dto.image,
        alt: dto.alt,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? (maxSortOrder ?? -1) + 1,
      })
      .returning();

    return created;
  }

  async update(
    storePhotoId: string,
    dto: UpdateStorePhotoDto,
  ): Promise<StorePhotoResponseDto> {
    const [updated] = await this.db
      .update(storePhoto)
      .set(dto)
      .where(eq(storePhoto.id, storePhotoId))
      .returning();
    if (!updated) throw notFoundError('storePhotoNotFound');

    return updated;
  }

  async remove(storePhotoId: string): Promise<void> {
    const deleted = await this.db
      .delete(storePhoto)
      .where(eq(storePhoto.id, storePhotoId))
      .returning({ id: storePhoto.id });
    if (deleted.length === 0) throw notFoundError('storePhotoNotFound');
  }

  async removeMany(ids: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const id of ids) {
        await startDeletedRecordBatch(tx);
        const deleted = await tx
          .delete(storePhoto)
          .where(eq(storePhoto.id, id))
          .returning({ id: storePhoto.id });
        if (!deleted.length) throw notFoundError('storePhotoNotFound');
      }
    });
  }

  async reorder(ids: string[], offset: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const [i, id] of ids.entries()) {
        await tx
          .update(storePhoto)
          .set({ sortOrder: offset + i })
          .where(eq(storePhoto.id, id));
      }
    });
  }
}

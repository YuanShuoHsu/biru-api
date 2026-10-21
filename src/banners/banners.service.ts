import { randomUUID } from 'crypto';

import { Inject, Injectable, NotFoundException } from '@nestjs/common';

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
import { startDeletedRecordBatch } from '../deleted-records/request-batch.js';
import { banner } from '../db/schema/banners.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import { DRIZZLE } from '../drizzle/drizzle.module.js';

import {
  buildFilterCondition,
  buildQuickFilterCondition,
  localTimeText,
} from '../common/utils/data-grid-filters.js';

import {
  BANNER_DATE_FILTER_FIELDS,
  BANNER_ENUM_FILTER_FIELDS,
  type BannerPaginationQueryDto,
} from './dto/banner-pagination-query.dto.js';
import type { BannerResponseDto } from './dto/banner-response.dto.js';
import type {
  CreateBannerDto,
  UpdateBannerDto,
} from './dto/create-banner.dto.js';

@Injectable()
export class BannersService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  // 前台輪播:僅啟用的圖,依排序顯示
  findAllActive(): Promise<BannerResponseDto[]> {
    return this.db.query.banner.findMany({
      where: eq(banner.isActive, true),
      orderBy: [asc(banner.sortOrder), asc(banner.createdAt)],
    });
  }

  async findAll(
    query: BannerPaginationQueryDto = {},
  ): Promise<{ data: BannerResponseDto[]; total: number }> {
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

    const bannerFieldMap: Record<string, Column | SQL> = {
      isActive: sql`${banner.isActive}::text`,
      createdAt: banner.createdAt,
      updatedAt: banner.updatedAt,
    };

    const dir = sortDirection === 'desc' ? desc : asc;
    const orderBy = sortBy
      ? [dir(bannerFieldMap[sortBy]), asc(banner.createdAt)]
      : [asc(banner.sortOrder), asc(banner.createdAt)];

    const where = and(
      filterField && filterOperator
        ? buildFilterCondition(
            filterField,
            filterOperator,
            filterValue,
            bannerFieldMap,
            [],
            BANNER_DATE_FILTER_FIELDS,
            BANNER_ENUM_FILTER_FIELDS,
          )
        : undefined,
      buildQuickFilterCondition({
        enumFields: BANNER_ENUM_FILTER_FIELDS,
        fieldMap: bannerFieldMap,
        quickFilterEnums,
        quickFilterValue,
        textConditions: (value) => [
          ilike(localTimeText(banner.createdAt), `%${value}%`),
          ilike(localTimeText(banner.updatedAt), `%${value}%`),
        ],
      }),
    );

    const [data, [{ total }]] = await Promise.all([
      this.db.query.banner.findMany({ where, orderBy, limit, offset }),
      this.db.select({ total: count() }).from(banner).where(where),
    ]);

    return { data, total };
  }

  async create(dto: CreateBannerDto): Promise<BannerResponseDto> {
    const [{ maxSortOrder }] = await this.db
      .select({ maxSortOrder: max(banner.sortOrder) })
      .from(banner);

    const [created] = await this.db
      .insert(banner)
      .values({
        id: randomUUID(),
        image: dto.image,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? (maxSortOrder ?? -1) + 1,
      })
      .returning();

    return created;
  }

  async update(
    bannerId: string,
    dto: UpdateBannerDto,
  ): Promise<BannerResponseDto> {
    const [updated] = await this.db
      .update(banner)
      .set(dto)
      .where(eq(banner.id, bannerId))
      .returning();
    if (!updated) throw new NotFoundException('Banner not found');

    return updated;
  }

  async remove(bannerId: string): Promise<void> {
    const deleted = await this.db
      .delete(banner)
      .where(eq(banner.id, bannerId))
      .returning({ id: banner.id });
    if (deleted.length === 0) throw new NotFoundException('Banner not found');
  }

  async removeMany(ids: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const id of ids) {
        await startDeletedRecordBatch(tx);
        const deleted = await tx
          .delete(banner)
          .where(eq(banner.id, id))
          .returning({ id: banner.id });
        if (!deleted.length) throw new NotFoundException('Banner not found');
      }
    });
  }

  async reorder(ids: string[], offset: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const [i, id] of ids.entries()) {
        await tx
          .update(banner)
          .set({ sortOrder: offset + i })
          .where(eq(banner.id, id));
      }
    });
  }
}

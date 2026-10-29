import { randomUUID } from 'crypto';

import { Inject, Injectable } from '@nestjs/common';

import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  ilike,
  isNull,
  lte,
  max,
  or,
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
import { badRequestError, notFoundError } from './banner-errors.js';
import type { BannerResponseDto } from './dto/banner-response.dto.js';
import type {
  CreateBannerDto,
  UpdateBannerDto,
} from './dto/create-banner.dto.js';

const toTimestamp = (
  value: string | null | undefined,
): Date | null | undefined => (value == null ? value : new Date(value));

@Injectable()
export class BannersService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  // 前台輪播:僅啟用且在上下架時間內的圖,依排序顯示
  findAllActive(): Promise<BannerResponseDto[]> {
    const now = new Date();

    return this.db.query.banner.findMany({
      where: and(
        eq(banner.isActive, true),
        or(isNull(banner.startsAt), lte(banner.startsAt, now)),
        or(isNull(banner.endsAt), gt(banner.endsAt, now)),
      ),
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
      startsAt: banner.startsAt,
      endsAt: banner.endsAt,
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
        alt: dto.alt,
        url: dto.url,
        isActive: dto.isActive ?? true,
        startsAt: toTimestamp(dto.startsAt),
        endsAt: toTimestamp(dto.endsAt),
        sortOrder: dto.sortOrder ?? (maxSortOrder ?? -1) + 1,
      })
      .returning();

    return created;
  }

  async update(
    bannerId: string,
    dto: UpdateBannerDto,
  ): Promise<BannerResponseDto> {
    const { startsAt, endsAt, ...fields } = dto;
    if (startsAt !== undefined || endsAt !== undefined) {
      const current = await this.db.query.banner.findFirst({
        where: eq(banner.id, bannerId),
        columns: { startsAt: true, endsAt: true },
      });
      if (!current) throw notFoundError('bannerNotFound');

      const from =
        startsAt === undefined ? current.startsAt : toTimestamp(startsAt);
      const until = endsAt === undefined ? current.endsAt : toTimestamp(endsAt);
      if (from && until && from >= until)
        throw badRequestError('scheduleInvalid');
    }

    const [updated] = await this.db
      .update(banner)
      .set({
        ...fields,
        startsAt: toTimestamp(startsAt),
        endsAt: toTimestamp(endsAt),
      })
      .where(eq(banner.id, bannerId))
      .returning();
    if (!updated) throw notFoundError('bannerNotFound');

    return updated;
  }

  async remove(bannerId: string): Promise<void> {
    const deleted = await this.db
      .delete(banner)
      .where(eq(banner.id, bannerId))
      .returning({ id: banner.id });
    if (deleted.length === 0) throw notFoundError('bannerNotFound');
  }

  async removeMany(ids: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const id of ids) {
        await startDeletedRecordBatch(tx);
        const deleted = await tx
          .delete(banner)
          .where(eq(banner.id, id))
          .returning({ id: banner.id });
        if (!deleted.length) throw notFoundError('bannerNotFound');
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

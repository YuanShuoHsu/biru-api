import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  type Column,
  type SQL,
} from 'drizzle-orm';

import {
  buildFilterCondition,
  buildQuickFilterCondition,
  escapeLike,
  localTimeText,
} from '../common/utils/data-grid-filters.js';
import { isUniqueViolation } from '../common/utils/pg-errors.js';
import { operatingCost } from '../db/schema/operating-costs.js';
import { DRIZZLE, type DrizzleDB } from '../drizzle/drizzle.module.js';

import {
  OPERATING_COST_DATE_FILTER_FIELDS,
  OPERATING_COST_ENUM_FILTER_FIELDS,
  OPERATING_COST_MONTH_FILTER_FIELDS,
  OPERATING_COST_NUMBER_FILTER_FIELDS,
  OPERATING_COST_STRING_FILTER_FIELDS,
  type OperatingCostPaginationQueryDto,
} from './dto/operating-cost-pagination-query.dto.js';
import type {
  CreateOperatingCostDto,
  OperatingCostListResponseDto,
  OperatingCostResponseDto,
  UpdateOperatingCostDto,
} from './dto/operating-cost.dto.js';
import { conflictError, notFoundError } from './operating-cost-errors.js';

@Injectable()
export class OperatingCostsService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async findAll(
    organizationId: string,
    query: OperatingCostPaginationQueryDto = {},
  ): Promise<OperatingCostListResponseDto> {
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

    const fieldMap: Record<string, Column | SQL> = {
      category: operatingCost.category,
      effectiveFrom: operatingCost.effectiveFrom,
      monthlyAmount: operatingCost.monthlyAmount,
      note: operatingCost.note,
      createdAt: operatingCost.createdAt,
      updatedAt: operatingCost.updatedAt,
    };

    const dir = sortDirection === 'desc' ? desc : asc;
    const orderBy = sortBy
      ? [dir(fieldMap[sortBy]), asc(operatingCost.id)]
      : [
          desc(operatingCost.effectiveFrom),
          asc(operatingCost.category),
          asc(operatingCost.id),
        ];

    const where = and(
      eq(operatingCost.organizationId, organizationId),
      filterField && filterOperator
        ? buildFilterCondition(
            filterField,
            filterOperator,
            filterValue,
            fieldMap,
            OPERATING_COST_STRING_FILTER_FIELDS,
            OPERATING_COST_DATE_FILTER_FIELDS,
            OPERATING_COST_ENUM_FILTER_FIELDS,
            OPERATING_COST_NUMBER_FILTER_FIELDS,
            [],
            [],
            [],
            OPERATING_COST_MONTH_FILTER_FIELDS,
          )
        : undefined,
      buildQuickFilterCondition({
        enumFields: OPERATING_COST_ENUM_FILTER_FIELDS,
        fieldMap,
        quickFilterEnums,
        quickFilterValue,
        textConditions: (value) => [
          ilike(operatingCost.effectiveFrom, `%${escapeLike(value)}%`),
          ilike(operatingCost.note, `%${escapeLike(value)}%`),
          ilike(
            localTimeText(operatingCost.createdAt),
            `%${escapeLike(value)}%`,
          ),
          ilike(
            localTimeText(operatingCost.updatedAt),
            `%${escapeLike(value)}%`,
          ),
        ],
      }),
    );

    const [data, [{ total }]] = await Promise.all([
      this.db.query.operatingCost.findMany({ where, orderBy, limit, offset }),
      this.db.select({ total: count() }).from(operatingCost).where(where),
    ]);

    return { data, total };
  }

  async findOne(
    organizationId: string,
    id: string,
  ): Promise<OperatingCostResponseDto> {
    const row = await this.db.query.operatingCost.findFirst({
      where: this.ownCost(organizationId, id),
    });
    if (!row) throw notFoundError('operatingCostNotFound');

    return row;
  }

  async create(
    organizationId: string,
    { category, effectiveFrom, monthlyAmount, note }: CreateOperatingCostDto,
  ): Promise<OperatingCostResponseDto> {
    try {
      const [row] = await this.db
        .insert(operatingCost)
        .values({
          id: randomUUID(),
          organizationId,
          category,
          effectiveFrom,
          monthlyAmount,
          note,
        })
        .returning();

      return row;
    } catch (error) {
      if (isUniqueViolation(error)) throw conflictError('operatingCostExists');
      throw error;
    }
  }

  async update(
    organizationId: string,
    id: string,
    { category, effectiveFrom, monthlyAmount, note }: UpdateOperatingCostDto,
  ): Promise<OperatingCostResponseDto> {
    if (
      [category, effectiveFrom, monthlyAmount, note].every(
        (value) => value === undefined,
      )
    )
      return this.findOne(organizationId, id);

    try {
      const [row] = await this.db
        .update(operatingCost)
        .set({
          category,
          effectiveFrom,
          monthlyAmount,
          note,
          updatedAt: new Date(),
        })
        .where(this.ownCost(organizationId, id))
        .returning();
      if (!row) throw notFoundError('operatingCostNotFound');

      return row;
    } catch (error) {
      if (isUniqueViolation(error)) throw conflictError('operatingCostExists');
      throw error;
    }
  }

  async remove(organizationId: string, id: string): Promise<void> {
    const deleted = await this.db
      .delete(operatingCost)
      .where(this.ownCost(organizationId, id))
      .returning({ id: operatingCost.id });
    if (!deleted.length) throw notFoundError('operatingCostNotFound');
  }

  private ownCost(organizationId: string, id: string) {
    return and(
      eq(operatingCost.organizationId, organizationId),
      eq(operatingCost.id, id),
    );
  }
}

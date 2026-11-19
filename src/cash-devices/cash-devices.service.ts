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
import { isForeignKeyViolation } from '../common/utils/pg-errors.js';
import { cashDevice } from '../db/schema/cash-devices.js';
import { DRIZZLE, type DrizzleDB } from '../drizzle/drizzle.module.js';

import { conflictError, notFoundError } from './cash-device-errors.js';
import {
  CASH_DEVICE_DATE_FILTER_FIELDS,
  CASH_DEVICE_ENUM_FILTER_FIELDS,
  CASH_DEVICE_STRING_FILTER_FIELDS,
  CashDevicePaginationQueryDto,
} from './dto/cash-device-pagination-query.dto.js';
import type {
  CashDeviceListResponseDto,
  CashDeviceResponseDto,
  CreateCashDeviceDto,
  UpdateCashDeviceDto,
} from './dto/cash-device.dto.js';

@Injectable()
export class CashDevicesService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  async findAll(
    organizationId: string,
    query: CashDevicePaginationQueryDto = {},
  ): Promise<CashDeviceListResponseDto> {
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
      name: cashDevice.name,
      vendor: cashDevice.vendor,
      model: cashDevice.model,
      status: cashDevice.status,
      lastSeenAt: cashDevice.lastSeenAt,
      createdAt: cashDevice.createdAt,
      updatedAt: cashDevice.updatedAt,
    };

    const dir = sortDirection === 'desc' ? desc : asc;
    const orderBy = sortBy
      ? [dir(fieldMap[sortBy]), asc(cashDevice.id)]
      : [asc(cashDevice.name), asc(cashDevice.id)];

    const where = and(
      eq(cashDevice.organizationId, organizationId),
      filterField && filterOperator
        ? buildFilterCondition(
            filterField,
            filterOperator,
            filterValue,
            fieldMap,
            CASH_DEVICE_STRING_FILTER_FIELDS,
            CASH_DEVICE_DATE_FILTER_FIELDS,
            CASH_DEVICE_ENUM_FILTER_FIELDS,
          )
        : undefined,
      buildQuickFilterCondition({
        enumFields: CASH_DEVICE_ENUM_FILTER_FIELDS,
        fieldMap,
        quickFilterEnums,
        quickFilterValue,
        textConditions: (value) => [
          ilike(cashDevice.name, `%${escapeLike(value)}%`),
          ilike(cashDevice.vendor, `%${escapeLike(value)}%`),
          ilike(cashDevice.model, `%${escapeLike(value)}%`),
          ilike(localTimeText(cashDevice.lastSeenAt), `%${escapeLike(value)}%`),
          ilike(localTimeText(cashDevice.createdAt), `%${escapeLike(value)}%`),
          ilike(localTimeText(cashDevice.updatedAt), `%${escapeLike(value)}%`),
        ],
      }),
    );

    const [data, [{ total }]] = await Promise.all([
      this.db.query.cashDevice.findMany({ where, orderBy, limit, offset }),
      this.db.select({ total: count() }).from(cashDevice).where(where),
    ]);

    return { data, total };
  }

  async findOne(
    organizationId: string,
    id: string,
  ): Promise<CashDeviceResponseDto> {
    const row = await this.db.query.cashDevice.findFirst({
      where: this.ownDevice(organizationId, id),
    });
    if (!row) throw notFoundError('cashDeviceNotFound');

    return row;
  }

  async create(
    organizationId: string,
    { name, vendor, model, status }: CreateCashDeviceDto,
  ): Promise<CashDeviceResponseDto> {
    const [row] = await this.db
      .insert(cashDevice)
      .values({ id: randomUUID(), organizationId, name, vendor, model, status })
      .returning();

    return row;
  }

  async update(
    organizationId: string,
    id: string,
    { name, vendor, model, status }: UpdateCashDeviceDto,
  ): Promise<CashDeviceResponseDto> {
    if ([name, vendor, model, status].every((value) => value === undefined))
      return this.findOne(organizationId, id);

    const [row] = await this.db
      .update(cashDevice)
      .set({ name, vendor, model, status, updatedAt: new Date() })
      .where(this.ownDevice(organizationId, id))
      .returning();
    if (!row) throw notFoundError('cashDeviceNotFound');

    return row;
  }

  async remove(organizationId: string, id: string): Promise<void> {
    try {
      const deleted = await this.db
        .delete(cashDevice)
        .where(this.ownDevice(organizationId, id))
        .returning({ id: cashDevice.id });
      if (!deleted.length) throw notFoundError('cashDeviceNotFound');
    } catch (error) {
      if (isForeignKeyViolation(error)) throw conflictError('cashDeviceInUse');
      throw error;
    }
  }

  private ownDevice(organizationId: string, id: string) {
    return and(
      eq(cashDevice.organizationId, organizationId),
      eq(cashDevice.id, id),
    );
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  and,
  asc,
  count,
  eq,
  ilike,
  sql,
  type Column,
  type SQL,
} from 'drizzle-orm';

import {
  buildFilterCondition,
  buildQuickFilterCondition,
  escapeLike,
  localTimeText,
} from '../common/utils/data-grid-filters.js';
import {
  type NullsAs,
  orderByDirection,
} from '../common/utils/data-grid-sort.js';
import { isForeignKeyViolation } from '../common/utils/pg-errors.js';
import {
  cashDevice,
  cashDeviceEvent,
  type CashDenominations,
  type CashDeviceEvent,
} from '../db/schema/cash-devices.js';
import { DRIZZLE, type DrizzleDB } from '../drizzle/drizzle.module.js';

import {
  badRequestError,
  conflictError,
  notFoundError,
} from './cash-device-errors.js';
import {
  CASH_DEVICE_DATE_FILTER_FIELDS,
  CASH_DEVICE_ENUM_FILTER_FIELDS,
  CASH_DEVICE_STRING_FILTER_FIELDS,
  CashDevicePaginationQueryDto,
} from './dto/cash-device-pagination-query.dto.js';
import {
  CASH_DEVICE_EVENT_DATE_FILTER_FIELDS,
  CASH_DEVICE_EVENT_ENUM_FILTER_FIELDS,
  type CashDeviceEventListResponseDto,
  type CashDeviceEventQueryDto,
  type CashDeviceEventResponseDto,
  type CreateCashDeviceCollectionDto,
  type CreateCashDeviceRefillDto,
} from './dto/cash-device-event.dto.js';
import type {
  CashDeviceListResponseDto,
  CashDeviceResponseDto,
  CreateCashDeviceDto,
  UpdateCashDeviceDto,
} from './dto/cash-device.dto.js';

type CashDeviceEventInput = Pick<
  CashDeviceEvent,
  'type' | 'denominations' | 'amount' | 'reportedAmount' | 'depositedAmount'
> & { idempotencyKey: string; note?: string | null };

const toAmount = (value: number) => value.toFixed(2);

const sortedDenominations = (denominations: object): CashDenominations =>
  Object.fromEntries(
    Object.entries(denominations)
      .filter(
        (entry): entry is [string, number] =>
          typeof entry[1] === 'number' && entry[1] > 0,
      )
      .sort(([left], [right]) => Number(left) - Number(right)),
  );

const isSameEvent = (row: CashDeviceEvent, input: CashDeviceEventInput) =>
  row.type === input.type &&
  row.amount === input.amount &&
  row.reportedAmount === input.reportedAmount &&
  row.depositedAmount === input.depositedAmount &&
  JSON.stringify(sortedDenominations(row.denominations)) ===
    JSON.stringify(input.denominations);

const toEventResponse = (row: CashDeviceEvent): CashDeviceEventResponseDto => ({
  ...row,
  difference:
    row.reportedAmount === null || row.depositedAmount === null
      ? null
      : toAmount(Number(row.depositedAmount) - Number(row.reportedAmount)),
});

const CASH_DEVICE_SORT_NULLS: Partial<Record<string, NullsAs>> = {
  vendor: 'last',
  model: 'last',
  lastSeenAt: 'last',
};

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

    const orderBy = sortBy
      ? [
          orderByDirection(
            fieldMap[sortBy],
            sortDirection,
            CASH_DEVICE_SORT_NULLS[sortBy],
          ),
          asc(cashDevice.id),
        ]
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

  async findEvents(
    organizationId: string,
    deviceId: string,
    {
      limit = 10,
      offset = 0,
      filterField,
      filterOperator,
      filterValue,
      sortBy,
      sortDirection = 'desc',
    }: CashDeviceEventQueryDto = {},
  ): Promise<CashDeviceEventListResponseDto> {
    await this.findOne(organizationId, deviceId);

    const fieldMap: Record<string, Column | SQL> = {
      type: sql`${cashDeviceEvent.type}::text`,
      occurredAt: cashDeviceEvent.occurredAt,
    };

    const tiebreakers = [
      orderByDirection(cashDeviceEvent.occurredAt, sortDirection),
      orderByDirection(cashDeviceEvent.id, sortDirection),
    ];
    const orderBy = sortBy
      ? [orderByDirection(fieldMap[sortBy], sortDirection), ...tiebreakers]
      : tiebreakers;

    const where = and(
      eq(cashDeviceEvent.deviceId, deviceId),
      filterField && filterOperator
        ? buildFilterCondition(
            filterField,
            filterOperator,
            filterValue,
            fieldMap,
            [],
            CASH_DEVICE_EVENT_DATE_FILTER_FIELDS,
            CASH_DEVICE_EVENT_ENUM_FILTER_FIELDS,
          )
        : undefined,
    );

    const [rows, [{ total }]] = await Promise.all([
      this.db.query.cashDeviceEvent.findMany({ where, orderBy, limit, offset }),
      this.db.select({ total: count() }).from(cashDeviceEvent).where(where),
    ]);

    return { data: rows.map(toEventResponse), total };
  }

  async refill(
    organizationId: string,
    deviceId: string,
    userId: string,
    { idempotencyKey, denominations, note }: CreateCashDeviceRefillDto,
  ): Promise<CashDeviceEventResponseDto> {
    const counted = sortedDenominations(denominations);
    const amount = Object.entries(counted).reduce(
      (sum, [value, count]) => sum + Number(value) * count,
      0,
    );
    if (!amount) throw badRequestError('cashDeviceRefillEmpty');

    return this.record(organizationId, deviceId, userId, {
      type: 'refill',
      idempotencyKey,
      denominations: counted,
      amount: toAmount(amount),
      reportedAmount: null,
      depositedAmount: null,
      note,
    });
  }

  async collect(
    organizationId: string,
    deviceId: string,
    userId: string,
    {
      idempotencyKey,
      reportedAmount,
      depositedAmount,
      note,
    }: CreateCashDeviceCollectionDto,
  ): Promise<CashDeviceEventResponseDto> {
    if (!reportedAmount && !depositedAmount)
      throw badRequestError('cashDeviceCollectionEmpty');

    return this.record(organizationId, deviceId, userId, {
      type: 'collection',
      idempotencyKey,
      denominations: {},
      amount: null,
      reportedAmount: toAmount(reportedAmount),
      depositedAmount: toAmount(depositedAmount),
      note,
    });
  }

  private async record(
    organizationId: string,
    deviceId: string,
    userId: string,
    input: CashDeviceEventInput,
  ): Promise<CashDeviceEventResponseDto> {
    const device = await this.findOne(organizationId, deviceId);
    const replay = await this.findReplay(deviceId, input);
    if (replay) return replay;
    if (device.status === 'inactive') throw conflictError('cashDeviceInactive');

    const [row] = await this.db
      .insert(cashDeviceEvent)
      .values({
        ...input,
        id: randomUUID(),
        organizationId,
        deviceId,
        createdBy: userId,
        occurredAt: new Date(),
      })
      .onConflictDoNothing({
        target: [cashDeviceEvent.deviceId, cashDeviceEvent.idempotencyKey],
      })
      .returning();

    return row
      ? toEventResponse(row)
      : (await this.findReplay(deviceId, input))!;
  }

  private async findReplay(deviceId: string, input: CashDeviceEventInput) {
    const row = await this.db.query.cashDeviceEvent.findFirst({
      where: and(
        eq(cashDeviceEvent.deviceId, deviceId),
        eq(cashDeviceEvent.idempotencyKey, input.idempotencyKey),
      ),
    });
    if (!row) return undefined;
    if (!isSameEvent(row, input)) throw conflictError('idempotencyConflict');

    return toEventResponse(row);
  }

  private ownDevice(organizationId: string, id: string) {
    return and(
      eq(cashDevice.organizationId, organizationId),
      eq(cashDevice.id, id),
    );
  }
}

import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';

import {
  CreateCashDeviceCollectionDto,
  CreateCashDeviceRefillDto,
} from './cash-device-event.dto.js';

const KEY = '0b9a3c4e-6f1d-4c2a-9e8b-7d5f3a1c2b4e';

const pathsOf = (errors: ValidationError[], prefix = ''): string[] =>
  errors.flatMap(({ property, children }) =>
    children?.length
      ? pathsOf(children, `${prefix}${property}.`)
      : [`${prefix}${property}`],
  );

const errorsOf = async (
  cls: new () => object,
  fields: Record<string, unknown>,
) =>
  pathsOf(
    await validate(plainToInstance(cls, fields), {
      forbidNonWhitelisted: true,
      whitelist: true,
    }),
  );

describe('CreateCashDeviceRefillDto', () => {
  it('accepts NT$ denominations with non-negative counts', async () => {
    expect(
      await errorsOf(CreateCashDeviceRefillDto, {
        idempotencyKey: KEY,
        denominations: { '1': 0, '10': 20, '2000': 1 },
      }),
    ).toEqual([]);
  });

  it.each([
    [{ '3': 1 }, 'denominations.3'],
    [{ '10': -1 }, 'denominations.10'],
    [{ '10': 1.5 }, 'denominations.10'],
    [{ '10': 10000 }, 'denominations.10'],
    ['10', 'denominations'],
  ])('rejects denominations %j', async (denominations, path) => {
    expect(
      await errorsOf(CreateCashDeviceRefillDto, {
        idempotencyKey: KEY,
        denominations,
      }),
    ).toEqual([path]);
  });

  it('requires a UUID idempotency key', async () => {
    expect(
      await errorsOf(CreateCashDeviceRefillDto, {
        idempotencyKey: 'retry-1',
        denominations: { '10': 1 },
      }),
    ).toEqual(['idempotencyKey']);
  });
});

describe('CreateCashDeviceCollectionDto', () => {
  it('accepts whole non-negative amounts', async () => {
    expect(
      await errorsOf(CreateCashDeviceCollectionDto, {
        idempotencyKey: KEY,
        reportedAmount: 0,
        depositedAmount: 9_999_999,
      }),
    ).toEqual([]);
  });

  it.each([
    [{ reportedAmount: -1, depositedAmount: 0 }, 'reportedAmount'],
    [{ reportedAmount: 0, depositedAmount: 10.5 }, 'depositedAmount'],
    [{ reportedAmount: 10_000_000, depositedAmount: 0 }, 'reportedAmount'],
  ])('rejects %j', async (amounts, path) => {
    expect(
      await errorsOf(CreateCashDeviceCollectionDto, {
        idempotencyKey: KEY,
        ...amounts,
      }),
    ).toEqual([path]);
  });
});

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateCashDeviceDto, UpdateCashDeviceDto } from './cash-device.dto.js';

const errorsOf = async (
  cls: new () => object,
  fields: Record<string, unknown>,
) =>
  (await validate(plainToInstance(cls, fields))).map(
    ({ property }) => property,
  );

describe('CreateCashDeviceDto', () => {
  it('accepts a device without a status', async () => {
    expect(await errorsOf(CreateCashDeviceDto, { name: '一號機' })).toEqual([]);
  });

  it('rejects a null status', async () => {
    expect(
      await errorsOf(CreateCashDeviceDto, { name: '一號機', status: null }),
    ).toEqual(['status']);
  });
});

describe('UpdateCashDeviceDto', () => {
  it('accepts an update without a status', async () => {
    expect(await errorsOf(UpdateCashDeviceDto, { name: '一號機' })).toEqual([]);
  });

  it('rejects a null status', async () => {
    expect(await errorsOf(UpdateCashDeviceDto, { status: null })).toEqual([
      'status',
    ]);
  });
});

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import {
  CreateSpecialHoursDto,
  UpdateSpecialHoursDto,
} from './special-hours.dto.js';

const errorsOf = async (
  cls: new () => object,
  fields: Record<string, unknown>,
) =>
  (await validate(plainToInstance(cls, fields))).map(
    ({ property }) => property,
  );

const range = { validFrom: '2027-02-05', validThrough: '2027-02-07' };

describe('CreateSpecialHoursDto', () => {
  it.each([null, 'Mo-Su 10:00-15:00'])(
    'accepts openingHours %j',
    async (openingHours) => {
      expect(
        await errorsOf(CreateSpecialHoursDto, { ...range, openingHours }),
      ).toEqual([]);
    },
  );

  it('要明確給 openingHours，省略不會被當成整天公休', async () => {
    expect(await errorsOf(CreateSpecialHoursDto, range)).toEqual([
      'openingHours',
    ]);
  });

  it.each([
    { validFrom: '2027-02-30' },
    { validThrough: '2027-02-07T00:00' },
    { openingHours: '' },
    { openingHours: 'Mo 25:00-26:00' },
    { note: 'x'.repeat(51) },
  ])('rejects %j', async (fields) => {
    expect(
      await errorsOf(CreateSpecialHoursDto, {
        ...range,
        openingHours: null,
        ...fields,
      }),
    ).toHaveLength(1);
  });
});

describe('UpdateSpecialHoursDto', () => {
  it('可以只改部分欄位，openingHours 與 note 可設為 null', async () => {
    expect(
      await errorsOf(UpdateSpecialHoursDto, { openingHours: null, note: null }),
    ).toEqual([]);
  });

  it('日期只能省略，不能設為 null', async () => {
    expect(
      await errorsOf(UpdateSpecialHoursDto, {
        validFrom: null,
        validThrough: null,
      }),
    ).toEqual(['validFrom', 'validThrough']);
  });
});

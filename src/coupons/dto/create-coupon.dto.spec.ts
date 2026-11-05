import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateCouponDto } from './create-coupon.dto.js';

const errorsOf = async (fields: Record<string, unknown>) =>
  (
    await validate(
      plainToInstance(CreateCouponDto, {
        code: 'WELCOME',
        discountType: 'fixed',
        discountValue: 50,
        ...fields,
      }),
    )
  ).map(({ property }) => property);

describe('CreateCouponDto', () => {
  it.each(['validFrom', 'validThrough'])(
    'accepts an offset %s',
    async (field) => {
      expect(await errorsOf({ [field]: '2026-10-31T16:00:00.000Z' })).toEqual(
        [],
      );
      expect(await errorsOf({ [field]: null })).toEqual([]);
    },
  );

  it.each([
    ['validFrom', '2026-11-01'],
    ['validFrom', '2026-11-01T00:00:00'],
    ['validThrough', '2026-W01'],
    ['validThrough', '2026-02-30T00:00:00+08:00'],
  ])(
    'rejects %s %j, which has no offset or is not a real date',
    async (field, value) => {
      expect(await errorsOf({ [field]: value })).toEqual([field]);
    },
  );
});

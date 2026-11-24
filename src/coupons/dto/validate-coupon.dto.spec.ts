import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { ValidateCouponDto } from './validate-coupon.dto.js';

const errorsOf = async (body: object) =>
  (
    await validate(plainToInstance(ValidateCouponDto, body), {
      forbidNonWhitelisted: true,
      whitelist: true,
    })
  ).map(({ property }) => property);

const item = { menuItemId: 'latte', quantity: 1, modifiers: {}, addOns: [] };

describe('ValidateCouponDto', () => {
  it('accepts the cart size and code length an order accepts', async () => {
    await expect(
      errorsOf({
        code: 'C'.repeat(64),
        items: Array.from({ length: 50 }, () => item),
        mode: 'pickup',
      }),
    ).resolves.toEqual([]);
  });

  it('rejects a cart or code an order would reject', async () => {
    await expect(
      errorsOf({
        code: 'C'.repeat(65),
        items: Array.from({ length: 51 }, () => item),
        mode: 'pickup',
      }),
    ).resolves.toEqual(['code', 'items']);
  });
});

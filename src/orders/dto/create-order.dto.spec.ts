import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateOrderDto, CreateOrderItemDto } from './create-order.dto.js';

const errorsOf = async (modifiers: unknown, addOnModifiers: unknown = {}) =>
  validate(
    plainToInstance(CreateOrderItemDto, {
      addOns: [{ menuItemId: 'add-on', modifiers: addOnModifiers }],
      menuItemId: 'item',
      modifiers,
      quantity: 1,
    }),
  );

describe('CreateOrderItemDto modifiers', () => {
  it('accepts modifier ids grouped by modifier group', async () => {
    expect(
      await errorsOf({ g1: ['m1', 'm2'], g2: [] }, { g3: ['m3'] }),
    ).toEqual([]);
  });

  it.each([{ g1: null }, { g1: 'm1' }, { g1: [1] }, ['m1'], null])(
    'rejects %j on the item',
    async (modifiers) => {
      const errors = await errorsOf(modifiers);
      expect(errors.map(({ property }) => property)).toEqual(['modifiers']);
    },
  );

  it('rejects malformed add-on modifiers', async () => {
    const errors = await errorsOf({}, { g1: null });
    expect(errors.map(({ property }) => property)).toEqual(['addOns']);
  });
});

describe('CreateOrderDto customer', () => {
  const customerErrorsOf = async (customer: unknown) =>
    (
      await validate(
        plainToInstance(CreateOrderDto, {
          customer,
          invoice: { type: 'personal' },
          items: [],
          mode: 'pickup',
          payment: 'Credit',
        }),
      )
    ).filter(({ property }) => property === 'customer');

  it('accepts a customer object', async () => {
    expect(await customerErrorsOf({ name: 'Amy' })).toEqual([]);
  });

  it.each([undefined, null])('rejects %j', async (customer) => {
    expect(await customerErrorsOf(customer)).toHaveLength(1);
  });
});

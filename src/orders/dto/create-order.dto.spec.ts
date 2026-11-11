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

  it.each([
    { name: 'a'.repeat(61) },
    { name: 'Amy', remark: 'a'.repeat(161) },
    { name: 'Amy', telephone: '1'.repeat(31) },
  ])('rejects an over-long field in %j', async (customer) => {
    expect(await customerErrorsOf(customer)).toHaveLength(1);
  });

  it('accepts fields at their maximum length', async () => {
    expect(
      await customerErrorsOf({
        name: 'a'.repeat(60),
        remark: 'a'.repeat(160),
        telephone: '1'.repeat(30),
      }),
    ).toEqual([]);
  });
});

describe('CreateOrderDto discountCode', () => {
  const discountCodeErrorsOf = async (discountCode: string) =>
    (
      await validate(
        plainToInstance(CreateOrderDto, {
          customer: { name: 'Amy' },
          discountCode,
          invoice: { type: 'personal' },
          items: [],
          mode: 'pickup',
          payment: 'Credit',
        }),
      )
    ).filter(({ property }) => property === 'discountCode');

  it('accepts a code as long as a coupon code can be', async () => {
    expect(await discountCodeErrorsOf('A'.repeat(64))).toEqual([]);
  });

  it('rejects a longer code', async () => {
    expect(await discountCodeErrorsOf('A'.repeat(65))).toHaveLength(1);
  });
});

describe('CreateOrderDto invoice', () => {
  const invoiceErrorsOf = async (invoice: object) =>
    (
      await validate(
        plainToInstance(CreateOrderDto, {
          customer: { name: 'Amy' },
          invoice,
          items: [],
          mode: 'pickup',
          payment: 'Credit',
        }),
      )
    )
      .filter(({ property }) => property === 'invoice')
      .flatMap(({ children }) => children ?? [])
      .map(({ constraints, property }) => ({ constraints, property }));

  it.each([
    { type: 'personal' },
    { carrierNum: '/AB+-.12', carrierType: 'mobile', type: 'personal' },
    {
      carrierNum: 'AB12345678901234',
      carrierType: 'certificate',
      type: 'personal',
    },
    {
      customerAddr: '台北市信義區',
      customerIdentifier: '12345675',
      customerName: '比如股份有限公司',
      type: 'company',
    },
    { donateCode: '168', type: 'donate' },
    { donateCode: '0123456', type: 'donate' },
  ])('accepts %j', async (invoice) => {
    expect(await invoiceErrorsOf(invoice)).toEqual([]);
  });

  it('ignores the formats of fields another invoice type uses', async () => {
    expect(
      await invoiceErrorsOf({
        carrierNum: 'bad',
        carrierType: 'mobile',
        customerIdentifier: '12345675',
        donateCode: '12',
        type: 'company',
        customerAddr: '台北市信義區',
        customerName: '比如股份有限公司',
      }),
    ).toEqual([]);
    expect(
      await invoiceErrorsOf({
        customerIdentifier: 'abc',
        customerName: '',
        type: 'personal',
      }),
    ).toEqual([]);
  });

  it.each([
    [
      { carrierType: 'mobile', type: 'personal' },
      'validation.invoiceMobileBarcode',
    ],
    [
      { carrierNum: '/abc1234', carrierType: 'mobile', type: 'personal' },
      'validation.invoiceMobileBarcode',
    ],
    [
      {
        carrierNum: 'A123456789012345',
        carrierType: 'certificate',
        type: 'personal',
      },
      'validation.invoiceCertificate',
    ],
  ])('rejects carrier number %j', async (invoice, key) => {
    expect(await invoiceErrorsOf(invoice)).toEqual([
      {
        constraints: { isCarrierNum: expect.stringMatching(`^${key}\\|`) },
        property: 'carrierNum',
      },
    ]);
  });

  it.each(['individual', 'constructor', '__proto__'])(
    'rejects carrier type %j without checking the carrier number',
    async (carrierType) => {
      expect(
        await invoiceErrorsOf({
          carrierNum: '/ABC1234',
          carrierType,
          type: 'personal',
        }),
      ).toEqual([
        {
          constraints: { isEnum: expect.any(String) },
          property: 'carrierType',
        },
      ]);
    },
  );

  it('rejects a whitespace-only company name and address', async () => {
    const errors = await invoiceErrorsOf({
      customerAddr: '   ',
      customerIdentifier: '12345675',
      customerName: ' \t',
      type: 'company',
    });

    expect(errors).toEqual([
      {
        constraints: {
          isNotEmpty: expect.stringMatching(/^validation\.isNotEmpty\|/),
        },
        property: 'customerName',
      },
      {
        constraints: {
          isNotEmpty: expect.stringMatching(/^validation\.isNotEmpty\|/),
        },
        property: 'customerAddr',
      },
    ]);
  });

  it('trims the company tax id, name and address', async () => {
    const dto = plainToInstance(CreateOrderDto, {
      invoice: {
        customerAddr: ' 台北市信義區 ',
        customerIdentifier: ' 12345675 ',
        customerName: ' 比如股份有限公司 ',
        type: 'company',
      },
    });

    expect(dto.invoice).toMatchObject({
      customerAddr: '台北市信義區',
      customerIdentifier: '12345675',
      customerName: '比如股份有限公司',
    });
  });

  it('requires the tax id, name and address on a company invoice', async () => {
    const errors = await invoiceErrorsOf({
      customerIdentifier: '1234567',
      type: 'company',
    });

    expect(errors.map(({ property }) => property)).toEqual([
      'customerIdentifier',
      'customerName',
      'customerAddr',
    ]);
    expect(errors[0].constraints).toEqual({
      isBusinessNumber: expect.stringMatching(/^validation\.businessNumber\|/),
    });
  });

  it.each([undefined, '12', '12345678'])(
    'rejects donate code %j',
    async (donateCode) => {
      expect(await invoiceErrorsOf({ donateCode, type: 'donate' })).toEqual([
        {
          constraints: {
            matches: expect.stringMatching(/^validation\.invoiceDonateCode\|/),
          },
          property: 'donateCode',
        },
      ]);
    },
  );
});

describe('CreateOrderDto pickupTime', () => {
  const pickupTimeErrorsOf = async (pickupTime: string) =>
    (
      await validate(
        plainToInstance(CreateOrderDto, {
          customer: { name: 'Amy' },
          invoice: { type: 'personal' },
          items: [],
          mode: 'pickup',
          payment: 'Credit',
          pickupTime,
        }),
      )
    ).filter(({ property }) => property === 'pickupTime');

  it.each(['2026-08-31T01:15:00.000Z', '2026-08-31T09:15:00+08:00'])(
    'accepts %j',
    async (pickupTime) => {
      expect(await pickupTimeErrorsOf(pickupTime)).toEqual([]);
    },
  );

  it.each([
    '2026-08-31T09:15:00',
    '2026-08-31',
    '2026-02-30T09:15:00+08:00',
    '2026-08-31T24:00:00+08:00',
    '2026-08-31T09:15:00+0800',
    '2026-08-31T09:15+08:00',
  ])(
    'rejects %j, which has no offset or is not a real time',
    async (pickupTime) => {
      expect(await pickupTimeErrorsOf(pickupTime)).toHaveLength(1);
    },
  );
});

describe('CreateOrderDto sharedCart', () => {
  const item = { addOns: [], menuItemId: 'latte', modifiers: {}, quantity: 1 };
  const propertiesOf = async (overrides: Record<string, unknown>) =>
    (
      await validate(
        plainToInstance(CreateOrderDto, {
          customer: { name: 'Amy' },
          invoice: { type: 'personal' },
          mode: 'counter',
          payment: 'Credit',
          ...overrides,
        }),
      )
    ).map(({ property }) => property);

  it('takes the items from the shared cart instead of the body', async () => {
    expect(await propertiesOf({ sharedCart: true })).toEqual([]);
  });

  it('rejects items sent along with sharedCart', async () => {
    expect(await propertiesOf({ items: [item], sharedCart: true })).toEqual([
      'sharedCart',
    ]);
  });

  it.each([{}, { sharedCart: false }])(
    'still requires items without a shared cart (%j)',
    async (overrides) => {
      expect(await propertiesOf(overrides)).toEqual(['items']);
      expect(await propertiesOf({ ...overrides, items: [item] })).toEqual([]);
    },
  );
});

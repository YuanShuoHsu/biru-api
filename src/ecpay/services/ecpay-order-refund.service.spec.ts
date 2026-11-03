import { EventEmitter2 } from '@nestjs/event-emitter';

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { I18nService } from 'nestjs-i18n';

import { createPGlite } from '../../../test/pglite.js';
import * as schema from '../../db/schema/index.js';
import type { DrizzleDB } from '../../drizzle/drizzle.module.js';
import type { I18nTranslations } from '../../generated/i18n.generated.js';

import { buildRefundPlan } from '../utils/refund-plan.js';

import { EcpayOrderRefundService } from './ecpay-order-refund.service.js';

const ORG = 'org';

describe('EcpayOrderRefundService.refundOrder 人工退款', () => {
  let client: PGlite;
  let service: EcpayOrderRefundService;
  const invalidInvoice = vi.fn();
  const getIssue = vi.fn();
  const inferItemDiscounts = vi.fn();

  beforeAll(async () => {
    client = createPGlite();
    const db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new EcpayOrderRefundService(
      db as unknown as DrizzleDB,
      {} as never,
      { invalidInvoice } as never,
      {} as never,
      {} as never,
      { getIssue } as never,
      { inferItemDiscounts, restore: vi.fn() } as never,
      { restoreAll: vi.fn() } as never,
      { withdrawOrder: vi.fn() } as never,
      { revokeForOrder: vi.fn() } as never,
      new EventEmitter2(),
      { t: (key: string) => key } as unknown as I18nService<I18nTranslations>,
      { refresh: vi.fn() } as never,
    );
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    inferItemDiscounts.mockReset().mockResolvedValue(null);
    await client.exec(
      'truncate refund, order_item, "order", organization cascade',
    );
    await client.query(
      `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values ($1, 'biru', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段')`,
      [ORG],
    );
    for (const [id, paymentMethod] of [
      ['cash', 'Cash'],
      ['twqr', 'TWQR'],
    ]) {
      await client.query(
        `insert into "order" (id, customer, mode, order_number, payment_method, seller_id, subtotal, payment_date, order_status)
         values ($1, '{"name":"客人"}', 'dineIn', $1, $2, $3, 100, now(), 'OrderDelivered')`,
        [id, paymentMethod, ORG],
      );
      await client.query(
        `insert into order_item (id, menu_item_id, menu_item_name, order_id, order_quantity, unit_price)
         values ($1, 'latte', '拿鐵', $2, 1, 100)`,
        [`${id}-1`, id],
      );
    }
  });

  const refundOf = (orderId: string) =>
    service.refundOrder('biru', orderId, { reasonCode: 'wrongItem' });

  it('現金的人工退款直接完成退款', async () => {
    await refundOf('cash');

    expect(
      (await client.query('select channel, status, amount from refund')).rows,
    ).toEqual([{ channel: 'manual', status: 'settled', amount: '100.00' }]);
  });

  it('非現金的人工退款也是人工通道', async () => {
    const refunded = await refundOf('twqr');

    expect(refunded).toMatchObject({ amount: '100.00', channel: 'manual' });
  });

  it('全額退款作廢發票時記錄退款的操作者與原因', async () => {
    await client.query(
      `insert into invoice (id, order_id, type, status, invoice_number, invoice_date, created_at, updated_at)
       values ('inv', 'cash', 'personal', 'issued', 'AB12345678', now(), now(), now())`,
    );

    await service.refundOrder(
      'biru',
      'cash',
      { reason: '客人取消', reasonCode: 'wrongItem' },
      'staff',
    );

    expect(invalidInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ Reason: '客人取消' }),
    );
    expect(
      (
        await client.query(
          `select status, voided_by, void_reason from invoice where id = 'inv'`,
        )
      ).rows,
    ).toEqual([
      { status: 'voided', voided_by: 'staff', void_reason: '客人取消' },
    ]);
  });

  it('作廢發票失敗後由排程補作廢時也記錄退款的操作者與原因', async () => {
    await client.query(
      `insert into invoice (id, order_id, type, status, invoice_number, invoice_date, created_at, updated_at)
       values ('inv', 'cash', 'personal', 'issued', 'AB12345678', now(), now(), now())`,
    );
    invalidInvoice.mockRejectedValueOnce(new Error('timeout'));

    await service.refundOrder(
      'biru',
      'cash',
      { reason: '客人取消', reasonCode: 'wrongItem' },
      'staff',
    );
    await client.query(
      `update refund set invoice_retry_at = now() - interval '1 minute'`,
    );
    getIssue.mockResolvedValue({
      IIS_Invalid_Status: '0',
      IIS_Remain_Allowance_Amt: '100',
      IIS_Sales_Amount: '100',
    });

    await service.repairInterruptedRefunds();

    expect(
      (
        await client.query(
          `select status, voided_by, void_reason from invoice where id = 'inv'`,
        )
      ).rows,
    ).toEqual([
      { status: 'voided', voided_by: 'staff', void_reason: '客人取消' },
    ]);
  });

  describe('舊訂單沒有每行折扣', () => {
    beforeEach(async () => {
      await client.query(
        `insert into "order" (id, customer, mode, order_number, payment_method, seller_id, subtotal, discount, discount_code, payment_date, order_status)
         values ('coupon', '{"name":"客人"}', 'dineIn', 'coupon', 'Cash', $1, 220, 65, 'CODE', now(), 'OrderDelivered')`,
        [ORG],
      );
      await client.query(
        `insert into order_item (id, menu_item_id, menu_item_name, order_id, order_quantity, unit_price)
         values ('latte', 'latte', '拿鐵', 'coupon', 2, 65), ('cake', 'cake', '蛋糕', 'coupon', 1, 90)`,
      );
    });

    const previewCake = () =>
      service.previewRefund('biru', 'coupon', {
        items: [{ orderItemId: 'cake', quantity: 1 }],
      });

    it('推算得出每行折扣時照每行折扣退', async () => {
      inferItemDiscounts.mockImplementation(
        ({ items }: { items: { id: string }[] }) =>
          Promise.resolve(items.map(({ id }) => (id === 'latte' ? 65 : 0))),
      );

      await expect(previewCake()).resolves.toEqual({
        allocatedDiscount: 0,
        amount: 90,
        isFull: false,
      });
    });

    it('已經照比例退過款的舊訂單不推算，避免下一筆退超過品項原價', async () => {
      inferItemDiscounts.mockImplementation(
        ({ items }: { items: { id: string }[] }) =>
          Promise.resolve(items.map(({ id }) => (id === 'latte' ? 65 : 0))),
      );
      await client.query(
        `insert into refund (id, amount, channel, status, items, order_id, reason_code, scope)
         values ('earlier', '63', 'manual', 'settled', $1, 'coupon', 'wrongItem', 'partial')`,
        [
          JSON.stringify([
            {
              amount: '90',
              menuItemName: '蛋糕',
              orderItemId: 'cake',
              quantity: 1,
              unitPrice: '90.00',
            },
          ]),
        ],
      );

      await expect(
        service.previewRefund('biru', 'coupon', {
          items: [{ orderItemId: 'latte', quantity: 1 }],
        }),
      ).resolves.toMatchObject({ isFull: false });
      expect(inferItemDiscounts).not.toHaveBeenCalled();
    });

    it('推算不出時照原價比例分攤', async () => {
      await expect(previewCake()).resolves.toEqual({
        allocatedDiscount: 27,
        amount: 63,
        isFull: false,
      });
      expect(inferItemDiscounts).toHaveBeenCalledWith(
        expect.objectContaining({ discountCode: 'CODE', sellerId: ORG }),
      );
    });
  });
});

describe('EcpayOrderRefundService 折讓品項', () => {
  const t = ((key: string) => key) as never;
  const buildAllowanceItems = (
    plan: ReturnType<typeof buildRefundPlan>,
  ): { ItemAmount: number; ItemCount: number; ItemPrice: number }[] =>
    (
      EcpayOrderRefundService.prototype as unknown as {
        buildAllowanceItems: (
          plan: ReturnType<typeof buildRefundPlan>,
        ) => { ItemAmount: number; ItemCount: number; ItemPrice: number }[];
      }
    ).buildAllowanceItems(plan);

  const refundInSteps = (
    order: Parameters<typeof buildRefundPlan>[0],
    steps: ({ orderItemId: string; quantity: number }[] | undefined)[],
  ) => {
    const previous: {
      amount: string;
      items: ReturnType<typeof buildRefundPlan>['items'];
    }[] = [];
    return steps.map((requested) => {
      const plan = buildRefundPlan(order, previous, requested, t);
      previous.push({ amount: String(plan.amount), items: plan.items });
      return plan;
    });
  };

  const expectBalanced = (plans: ReturnType<typeof buildRefundPlan>[]) => {
    for (const plan of plans) {
      const items = buildAllowanceItems(plan);
      expect(items.reduce((sum, item) => sum + item.ItemAmount, 0)).toBe(
        plan.amount,
      );
      for (const item of items) {
        expect(Number.isInteger(item.ItemAmount)).toBe(true);
        expect(
          Math.abs(item.ItemPrice * item.ItemCount - item.ItemAmount),
        ).toBeLessThanOrEqual(1);
      }
    }
  };

  const integerOrder = {
    items: [
      {
        discount: null,
        id: 'a',
        menuItemName: 'A',
        orderQuantity: 3,
        unitPrice: '120.00',
      },
      {
        discount: null,
        id: 'b',
        menuItemName: 'B',
        orderQuantity: 2,
        unitPrice: '76.00',
      },
      {
        discount: null,
        id: 'c',
        menuItemName: 'C',
        orderQuantity: 1,
        unitPrice: '333.00',
      },
    ],
    total: '700.00',
  };

  it('整數單價的折讓內容維持不變', () => {
    const plans = refundInSteps(integerOrder, [
      [{ orderItemId: 'a', quantity: 2 }],
      [{ orderItemId: 'b', quantity: 1 }],
      undefined,
    ]);

    expect(
      JSON.stringify(
        plans.map((plan) => [plan.amount, buildAllowanceItems(plan)]),
      ),
    ).toBe(
      '[[199,[{"ItemAmount":240,"ItemCount":2,"ItemName":"A","ItemPrice":120,"ItemSeq":1,"ItemWord":"份"},{"ItemAmount":-41,"ItemCount":1,"ItemName":"折扣","ItemPrice":-41,"ItemSeq":2,"ItemWord":"份"}]],[63,[{"ItemAmount":76,"ItemCount":1,"ItemName":"B","ItemPrice":76,"ItemSeq":1,"ItemWord":"份"},{"ItemAmount":-13,"ItemCount":1,"ItemName":"折扣","ItemPrice":-13,"ItemSeq":2,"ItemWord":"份"}]],[438,[{"ItemAmount":120,"ItemCount":1,"ItemName":"A","ItemPrice":120,"ItemSeq":1,"ItemWord":"份"},{"ItemAmount":76,"ItemCount":1,"ItemName":"B","ItemPrice":76,"ItemSeq":2,"ItemWord":"份"},{"ItemAmount":333,"ItemCount":1,"ItemName":"C","ItemPrice":333,"ItemSeq":3,"ItemWord":"份"},{"ItemAmount":-91,"ItemCount":1,"ItemName":"折扣","ItemPrice":-91,"ItemSeq":4,"ItemWord":"份"}]]]',
    );
  });

  it('全額退款的品項金額是發票品項金額取整，折扣跟著發票', () => {
    const [plan] = refundInSteps(
      {
        items: [
          {
            discount: null,
            id: 'a',
            menuItemName: 'A',
            orderQuantity: 15,
            unitPrice: '4.10',
          },
        ],
        total: '61.00',
      },
      [undefined],
    );

    expect(buildAllowanceItems(plan).map((item) => item.ItemAmount)).toEqual([
      62, -1,
    ]);
  });

  it.each([
    [
      '小數單價全額退款',
      {
        items: [
          {
            discount: null,
            id: 'a',
            menuItemName: 'A',
            orderQuantity: 3,
            unitPrice: '33.33',
          },
        ],
        total: '100.00',
      },
      [undefined],
    ],
    [
      '每項都捨去時全額退款',
      {
        items: [
          {
            discount: null,
            id: 'a',
            menuItemName: 'A',
            orderQuantity: 1,
            unitPrice: '10.40',
          },
          {
            discount: null,
            id: 'b',
            menuItemName: 'B',
            orderQuantity: 1,
            unitPrice: '10.40',
          },
        ],
        total: '21.00',
      },
      [undefined],
    ],
    [
      '每項都捨去時分次退款',
      {
        items: [
          {
            discount: null,
            id: 'a',
            menuItemName: 'A',
            orderQuantity: 1,
            unitPrice: '10.40',
          },
          {
            discount: null,
            id: 'b',
            menuItemName: 'B',
            orderQuantity: 1,
            unitPrice: '10.40',
          },
        ],
        total: '21.00',
      },
      [[{ orderItemId: 'a', quantity: 1 }], undefined],
    ],
    [
      '浮點誤差會捨錯的單價',
      {
        items: [
          {
            discount: null,
            id: 'a',
            menuItemName: 'A',
            orderQuantity: 15,
            unitPrice: '4.10',
          },
        ],
        total: '61.00',
      },
      [[{ orderItemId: 'a', quantity: 5 }], undefined],
    ],
    [
      '只折部分品項的優惠券分次退款',
      {
        items: [
          {
            discount: '0.00',
            id: 'a',
            menuItemName: 'A',
            orderQuantity: 1,
            unitPrice: '100.00',
          },
          {
            discount: '50.00',
            id: 'b',
            menuItemName: 'B',
            orderQuantity: 3,
            unitPrice: '33.33',
          },
        ],
        total: '150.00',
      },
      [
        [{ orderItemId: 'b', quantity: 1 }],
        [{ orderItemId: 'a', quantity: 1 }],
        undefined,
      ],
    ],
    [
      '小數單價加優惠券折扣分次退款',
      {
        items: [
          {
            discount: null,
            id: 'a',
            menuItemName: 'A',
            orderQuantity: 3,
            unitPrice: '33.33',
          },
          {
            discount: null,
            id: 'b',
            menuItemName: 'B',
            orderQuantity: 2,
            unitPrice: '12.50',
          },
        ],
        total: '105.00',
      },
      [
        [{ orderItemId: 'a', quantity: 2 }],
        [{ orderItemId: 'b', quantity: 1 }],
        undefined,
      ],
    ],
  ] as const)('%s的折讓品項加總等於折讓金額', (_, order, steps) => {
    const plans = refundInSteps(
      order as never,
      steps as unknown as (
        { orderItemId: string; quantity: number }[] | undefined
      )[],
    );

    expectBalanced(plans);
    expect(plans.reduce((sum, plan) => sum + plan.amount, 0)).toBe(
      Number(order.total),
    );
  });
});

import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import type { I18nService } from 'nestjs-i18n';

import { createPGlite } from '../../test/pglite.js';
import { auditLog } from '../db/schema/audit.js';
import type { Coupon } from '../db/schema/coupons.js';
import { coupon } from '../db/schema/coupons.js';
import * as schema from '../db/schema/index.js';
import { menu, menuItem, menuSection } from '../db/schema/menus.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import type { I18nTranslations } from '../generated/i18n.generated.js';
import type {
  OrderPricingService,
  ResolvedOrderItem,
} from '../orders/order-pricing.service.js';

import { buildRefundPlan } from '../ecpay/utils/refund-plan.js';

import { CouponsService } from './coupons.service.js';

const ORG_ID = 'org';

const items = [
  {
    menuItemId: 'latte',
    menuSectionIds: ['coffee'],
    orderQuantity: 2,
    unitPrice: '65.00',
  },
  {
    menuItemId: 'cake',
    menuSectionIds: ['dessert'],
    orderQuantity: 1,
    unitPrice: '89.50',
  },
] as ResolvedOrderItem[];

const baseCoupon: Partial<Coupon> = {
  applicableOrganizationIds: null,
  code: 'CODE',
  discountType: 'fixed',
  discountValue: '50',
  id: 'coupon',
  isActive: true,
  menuItemIds: null,
  menuSectionIds: null,
  minSubtotal: null,
  perUserLimit: null,
  pointsCost: null,
  scope: 'order',
  totalLimit: null,
  usedCount: 0,
  validFrom: null,
  validThrough: null,
};

const applicableOf = (coupon: Partial<Coupon>) => {
  const db = {
    query: {
      coupon: {
        findMany: vi.fn().mockResolvedValue([{ ...baseCoupon, ...coupon }]),
      },
    },
  };
  const service = new CouponsService(
    db as unknown as DrizzleDB,
    { t: (key: string) => key } as unknown as I18nService<I18nTranslations>,
    {} as OrderPricingService,
  );

  return service.getApplicableCoupon(ORG_ID, 'code', items, null);
};

const discountOf = (coupon: Partial<Coupon>) =>
  applicableOf(coupon).then(({ discount }) => discount);

describe('CouponsService.getApplicableCoupon 折扣金額', () => {
  it('百分比折扣四捨五入到整數', async () => {
    // 219.5 × 15% = 32.925
    await expect(
      discountOf({ discountType: 'percentage', discountValue: '15' }),
    ).resolves.toBe(33);
  });

  it('定額折扣不超過小計', async () => {
    await expect(discountOf({ discountValue: '500' })).resolves.toBe(220);
  });

  it('指定品項只折該品項的金額', async () => {
    await expect(
      discountOf({
        discountType: 'percentage',
        discountValue: '50',
        menuItemIds: ['latte'],
        scope: 'item',
      }),
    ).resolves.toBe(65);
  });

  it('指定分類的定額折扣以該分類金額為上限', async () => {
    await expect(
      discountOf({
        discountValue: '100',
        menuSectionIds: ['dessert'],
        scope: 'item',
      }),
    ).resolves.toBe(90);
  });

  it('購物車沒有適用品項時拒絕', async () => {
    await expect(
      discountOf({ menuItemIds: ['tea'], scope: 'item' }),
    ).rejects.toThrow('common.coupons.notApplicable');
  });

  it('未達低消門檻時拒絕', async () => {
    await expect(discountOf({ minSubtotal: '220' })).rejects.toThrow(
      'common.coupons.minSubtotal',
    );
  });

  it('不適用此店時拒絕', async () => {
    await expect(
      discountOf({ applicableOrganizationIds: ['other-org'] }),
    ).rejects.toThrow('common.coupons.notApplicableHere');
  });
});

describe('CouponsService 自動發券', () => {
  it('鎖住會員列後才計算消費券缺額並發放', async () => {
    const calls: string[] = [];
    const insertValues = vi.fn().mockResolvedValue(undefined);
    const tx = {
      insert: vi.fn(() => ({ values: insertValues })),
      select: vi
        .fn()
        .mockReturnValueOnce({
          from: () => ({
            where: () => ({
              for: (strength: string) => {
                calls.push(`lock:${strength}`);
                return Promise.resolve([{ birthDate: null }]);
              },
            }),
          }),
        })
        .mockReturnValueOnce({
          from: () => ({
            innerJoin: () => ({
              where: () => ({
                groupBy: () => ({
                  having: () => {
                    calls.push('qualified');
                    return Promise.resolve([{ id: 'o1' }, { id: 'o2' }]);
                  },
                }),
              }),
            }),
          }),
        })
        .mockReturnValueOnce({
          from: () => ({
            where: () => {
              calls.push('issued');
              return Promise.resolve([{ value: 1 }]);
            },
          }),
        }),
    };
    const db = {
      query: {
        coupon: {
          findMany: vi.fn().mockResolvedValue([
            {
              ...baseCoupon,
              issueMinSpend: '100',
              issueTrigger: 'spend',
            },
          ]),
        },
      },
      transaction: vi.fn((callback: (t: typeof tx) => Promise<void>) =>
        callback(tx),
      ),
    };
    const service = new CouponsService(
      db as unknown as DrizzleDB,
      { t: (key: string) => key } as unknown as I18nService<I18nTranslations>,
      {} as OrderPricingService,
    );

    await service['issueEligibleCoupons'](ORG_ID, 'user');

    expect(calls).toEqual(['lock:no key update', 'qualified', 'issued']);
    expect(insertValues).toHaveBeenCalledWith([
      expect.objectContaining({ couponId: 'coupon', source: 'spend' }),
    ]);
  });
});

describe('CouponsService.getApplicableCoupon 每行折扣', () => {
  it('整單折扣依各行小計分攤，加總等於折扣', async () => {
    const { itemDiscounts } = await applicableOf({ discountValue: '50' });

    // 130 : 89.5
    expect(itemDiscounts).toEqual([29.61, 20.39]);
  });

  it('指定品項的折扣只落在符合的行', async () => {
    const { itemDiscounts } = await applicableOf({
      discountType: 'percentage',
      discountValue: '50',
      menuSectionIds: ['dessert'],
      scope: 'item',
    });

    expect(itemDiscounts).toEqual([0, 45]);
  });
});

describe('CouponsService.inferItemDiscounts 舊訂單推算每行折扣', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const daysAgo = (days: number) => new Date(Date.now() - days * DAY);

  let client: PGlite;
  let db: ReturnType<typeof drizzle<typeof schema>>;
  let service: CouponsService;

  beforeAll(async () => {
    client = createPGlite();
    db = drizzle(client, { schema });
    await migrate(db, { migrationsFolder: './drizzle' });
    service = new CouponsService(
      db as unknown as DrizzleDB,
      { t: (key: string) => key } as unknown as I18nService<I18nTranslations>,
      {} as OrderPricingService,
    );
    await client.query(
      `insert into organization (id, name, slug, created_at, address_country, address_locality, address_region, street_address) values ($1, 'Biru', 'biru', now(), 'TW', '桃園市', '大園區', '中正東路一段')`,
      [ORG_ID],
    );
    await db
      .insert(menu)
      .values({ id: 'menu', organizationId: ORG_ID, name: { en: 'Menu' } });
    await db.insert(menuSection).values([
      { id: 'drinks', menuId: 'menu', name: { en: 'Drinks' } },
      {
        id: 'coffee',
        menuId: 'menu',
        name: { en: 'Coffee' },
        parentSectionId: 'drinks',
      },
      { id: 'dessert', menuId: 'menu', name: { en: 'Dessert' } },
    ]);
    await db.insert(menuItem).values([
      {
        id: 'latte',
        menuId: 'menu',
        menuSectionId: 'coffee',
        name: { en: 'Latte' },
      },
      {
        id: 'cake',
        menuId: 'menu',
        menuSectionId: 'dessert',
        name: { en: 'Cake' },
      },
    ]);
  }, 60_000);

  afterAll(async () => {
    await client.close();
  });

  beforeEach(async () => {
    await client.exec('truncate audit_log, coupon cascade');
  });

  const seedCoupon = async (values: Partial<Coupon> = {}) => {
    await db.insert(coupon).values({
      code: 'CODE',
      createdAt: daysAgo(30),
      discountType: 'percentage',
      discountValue: '50',
      id: 'coupon',
      menuItemIds: ['latte'],
      scope: 'item',
      ...values,
    });
    await audit('coupon', 'coupon', daysAgo(30), { code: {} });
  };

  const audit = (
    resource: 'coupon' | 'menuItem' | 'menuSection',
    resourceId: string,
    createdAt: Date,
    changes: Record<string, unknown>,
  ) =>
    db.insert(auditLog).values({
      action: 'update',
      actorEmail: 'admin@example.com',
      actorName: 'admin',
      changes: Object.fromEntries(
        Object.keys(changes).map((key) => [key, { after: 1, before: 0 }]),
      ),
      createdAt,
      id: `${resource}-${resourceId}-${createdAt.getTime()}`,
      resource,
      resourceId,
    });

  const placed = (values: { createdAt?: Date; discount?: string } = {}) => ({
    createdAt: daysAgo(10),
    discount: '65.00',
    discountCode: 'code',
    items: [
      {
        discount: null,
        id: 'line-latte',
        menuItemId: 'latte',
        menuItemName: '拿鐵',
        orderQuantity: 2,
        unitPrice: '65.00',
      },
      {
        discount: null,
        id: 'line-cake',
        menuItemId: 'cake',
        menuItemName: '蛋糕',
        orderQuantity: 1,
        unitPrice: '90.00',
      },
    ],
    sellerId: ORG_ID,
    ...values,
  });

  it('只折指定品項且券沒改過時推回每行折扣，只退沒折扣的品項就全額退', async () => {
    await seedCoupon();
    await audit('coupon', 'coupon', daysAgo(5), { usedCount: {} });

    const order = placed();
    const inferred = await service.inferItemDiscounts(order);
    expect(inferred).toEqual([65, 0]);

    const plan = buildRefundPlan(
      {
        items: order.items.map((item, index) => ({
          ...item,
          discount: inferred![index].toFixed(2),
        })),
        total: '155.00',
      },
      [],
      [{ orderItemId: 'line-cake', quantity: 1 }],
      ((key: string) => key) as never,
    );
    expect(plan).toMatchObject({ allocatedDiscount: 0, amount: 90 });
  });

  it.each([
    'applicableOrganizationIds',
    'code',
    'discountType',
    'discountValue',
    'menuItemIds',
    'menuSectionIds',
    'scope',
  ])('下單後改過券的 %s 就不推算', async (column) => {
    await seedCoupon();
    await audit('coupon', 'coupon', daysAgo(5), { [column]: {} });

    await expect(service.inferItemDiscounts(placed())).resolves.toBeNull();
  });

  it('券在下單前一刻改過也不推算，因為下單時讀券早於訂單建立', async () => {
    await seedCoupon();
    const order = placed();
    await audit(
      'coupon',
      'coupon',
      new Date(order.createdAt.getTime() - 30_000),
      { menuItemIds: {} },
    );

    await expect(service.inferItemDiscounts(order)).resolves.toBeNull();
  });

  it('券不適用這間店就不推算', async () => {
    await seedCoupon({ applicableOrganizationIds: ['other-store'] });

    await expect(service.inferItemDiscounts(placed())).resolves.toBeNull();
  });

  it('下單前的修改不影響推算', async () => {
    await seedCoupon();
    await audit('coupon', 'coupon', daysAgo(20), { menuItemIds: {} });

    await expect(service.inferItemDiscounts(placed())).resolves.toEqual([
      65, 0,
    ]);
  });

  it('同碼的券建立在下單之後就不推算', async () => {
    await seedCoupon({ createdAt: daysAgo(5) });

    await expect(service.inferItemDiscounts(placed())).resolves.toBeNull();
  });

  it('下單時券的異動還沒有稽核紀錄就不推算', async () => {
    await seedCoupon();
    await client.exec('truncate audit_log');
    await audit('coupon', 'coupon', daysAgo(5), { usedCount: {} });

    await expect(service.inferItemDiscounts(placed())).resolves.toBeNull();
  });

  const auditMenuTree = async () => {
    await audit('menuItem', 'cake', daysAgo(30), { name: {} });
    await audit('menuSection', 'dessert', daysAgo(30), { name: {} });
  };

  it('依分類適用時用目前的分類樹推算，含上層分類', async () => {
    await seedCoupon({ menuItemIds: null, menuSectionIds: ['drinks'] });
    await auditMenuTree();
    await audit('menuItem', 'latte', daysAgo(5), { name: {} });

    await expect(service.inferItemDiscounts(placed())).resolves.toEqual([
      65, 0,
    ]);
  });

  it('與訂單無關的品項、分類與其他券在下單後的異動不影響推算', async () => {
    await seedCoupon({ menuItemIds: null, menuSectionIds: ['drinks'] });
    await auditMenuTree();
    await audit('coupon', 'other-coupon', daysAgo(5), { menuItemIds: {} });
    await audit('menuItem', 'other-item', daysAgo(5), { menuSectionId: {} });
    await audit('menuSection', 'other-section', daysAgo(5), {
      parentSectionId: {},
    });

    await expect(service.inferItemDiscounts(placed())).resolves.toEqual([
      65, 0,
    ]);
  });

  it('下單時分類的稽核還沒開始就不推算', async () => {
    await seedCoupon({ menuItemIds: null, menuSectionIds: ['drinks'] });
    await audit('menuItem', 'cake', daysAgo(30), { name: {} });

    await expect(service.inferItemDiscounts(placed())).resolves.toBeNull();
  });

  it('品項在下單後換過分類就不推算', async () => {
    await seedCoupon({ menuItemIds: null, menuSectionIds: ['drinks'] });
    await auditMenuTree();
    await audit('menuItem', 'latte', daysAgo(5), { menuSectionId: {} });

    await expect(service.inferItemDiscounts(placed())).resolves.toBeNull();
  });

  it('分類在下單後換過上層就不推算', async () => {
    await seedCoupon({ menuItemIds: null, menuSectionIds: ['drinks'] });
    await auditMenuTree();
    await audit('menuSection', 'coffee', daysAgo(5), { parentSectionId: {} });

    await expect(service.inferItemDiscounts(placed())).resolves.toBeNull();
  });

  it('品項已不存在就不推算分類', async () => {
    await seedCoupon({ menuItemIds: null, menuSectionIds: ['drinks'] });
    await auditMenuTree();
    const order = placed();
    order.items[0].menuItemId = 'gone';

    await expect(service.inferItemDiscounts(order)).resolves.toBeNull();
  });

  it('重算的折扣與訂單折扣不符就不推算', async () => {
    await seedCoupon();

    await expect(
      service.inferItemDiscounts(placed({ discount: '60.00' })),
    ).resolves.toBeNull();
  });

  it('全單券依各行原價分攤', async () => {
    await seedCoupon({
      discountType: 'fixed',
      discountValue: '50',
      menuItemIds: null,
      scope: 'order',
    });

    await expect(
      service.inferItemDiscounts(placed({ discount: '50.00' })),
    ).resolves.toEqual([29.55, 20.45]);
  });

  it('超過異動紀錄保留期的訂單不推算', async () => {
    await seedCoupon({ createdAt: daysAgo(500) });
    await audit('coupon', 'coupon', daysAgo(500), { code: {} });

    await expect(
      service.inferItemDiscounts(placed({ createdAt: daysAgo(400) })),
    ).resolves.toBeNull();
  });

  it('已記錄每行折扣的新訂單不推算', async () => {
    await seedCoupon();
    const order = placed();
    const items = order.items.map((item) => ({ ...item, discount: '0.00' }));

    await expect(
      service.inferItemDiscounts({ ...order, items }),
    ).resolves.toBeNull();
  });
});

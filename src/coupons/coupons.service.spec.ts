import type { I18nService } from 'nestjs-i18n';

import type { Coupon } from '../db/schema/coupons.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import type { I18nTranslations } from '../generated/i18n.generated.js';
import type {
  OrderPricingService,
  ResolvedOrderItem,
} from '../orders/order-pricing.service.js';

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

const discountOf = (coupon: Partial<Coupon>) => {
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

  return service
    .getApplicableCoupon(ORG_ID, 'code', items, null)
    .then(({ discount }) => discount);
};

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

    expect(calls[0]).toBe('lock:update');
    expect(insertValues).toHaveBeenCalledWith([
      expect.objectContaining({ couponId: 'coupon', source: 'spend' }),
    ]);
  });
});

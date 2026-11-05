import { BadRequestException } from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';

import type { PriceSpecification } from '../db/schema/menus.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';

import type { CreateOrderItemDto } from './dto/create-order.dto.js';
import { OrderPricingService } from './order-pricing.service.js';

const MENU_ID = 'menu';

const menuItemOf = (id: string, name: string) => ({
  id,
  availableModes: ['counter'],
  fixedSweetnessLevel: null,
  menuId: MENU_ID,
  menuSection: null,
  menuSectionId: null,
  name: { 'zh-TW': name },
  servingTemperatures: [],
  sweetness: 'Fixed',
});

const latte = menuItemOf('latte', '拿鐵');
const cookie = menuItemOf('cookie', '餅乾');

const cartItemOf = (
  overrides: Partial<CreateOrderItemDto> = {},
): CreateOrderItemDto => ({
  addOns: [],
  menuItemId: latte.id,
  modifiers: {},
  quantity: 1,
  ...overrides,
});

const createService = (
  menuItems: object[],
  menuSections: { id: string; parentSectionId: string | null }[] = [],
  priceSpecification: PriceSpecification | null = null,
) => {
  const db = {
    query: {
      menuSection: { findMany: vi.fn().mockResolvedValue(menuSections) },
      menu: {
        findFirst: vi.fn().mockResolvedValue({
          id: MENU_ID,
          organization: { currency: 'TWD' },
        }),
      },
      menuItem: { findMany: vi.fn().mockResolvedValue(menuItems) },
      menuItemAddOn: { findMany: vi.fn().mockResolvedValue([]) },
      menuItemModifierGroup: { findMany: vi.fn().mockResolvedValue([]) },
      modifier: { findMany: vi.fn().mockResolvedValue([]) },
      offer: {
        findMany: vi.fn().mockResolvedValue(
          menuItems.map(({ id }: { id?: string }) => ({
            availability: 'InStock',
            menuItemId: id,
            price: '100.00',
            priceSpecification,
          })),
        ),
      },
    },
  };

  return new OrderPricingService(db as unknown as DrizzleDB);
};

beforeEach(() => {
  vi.spyOn(I18nContext, 'current').mockReturnValue({
    t: (key: string, options?: { args?: { name?: string } }) =>
      options?.args?.name ? `${key}:${options.args.name}` : key,
  } as unknown as I18nContext);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('OrderPricingService.resolveOrderItems', () => {
  it('購物車裡的品項已被店家刪除時提示菜單已更新', async () => {
    const service = createService([]);

    const result = service.resolveOrderItems('org', [cartItemOf()], 'counter');

    await expect(result).rejects.toBeInstanceOf(BadRequestException);
    await expect(result).rejects.toThrow('common.orders.menuChanged');
  });

  it('品項改成可調甜度後沒帶甜度，以品項名稱提示重新確認選項', async () => {
    const service = createService([{ ...latte, sweetness: 'Adjustable' }]);

    await expect(
      service.resolveOrderItems('org', [cartItemOf()], 'counter'),
    ).rejects.toThrow('common.orders.menuItemOptionsInvalid:拿鐵');
  });

  it('加購品已不再搭配主品項時，以主品項名稱提示重新確認選項', async () => {
    const service = createService([latte, cookie]);

    await expect(
      service.resolveOrderItems(
        'org',
        [
          cartItemOf({
            addOns: [{ menuItemId: cookie.id, modifiers: {} }],
          }),
        ],
        'counter',
      ),
    ).rejects.toThrow('common.orders.menuItemOptionsInvalid:拿鐵');
  });

  it('品項的分類清單包含所有上層分類，讓最上層分類的優惠券也套得到', async () => {
    const service = createService(
      [{ ...latte, menuSectionId: 'oolong' }],
      [
        { id: 'drinks', parentSectionId: null },
        { id: 'tea', parentSectionId: 'drinks' },
        { id: 'oolong', parentSectionId: 'tea' },
      ],
    );

    const [item] = await service.resolveOrderItems(
      'org',
      [cartItemOf()],
      'counter',
    );

    expect(item.menuSectionIds).toEqual(['oolong', 'tea', 'drinks']);
  });

  describe('促銷價依平台時區的日期判斷，起訖兩天都含整天', () => {
    const unitPriceAt = async (
      time: string,
      priceSpecification: PriceSpecification,
    ) => {
      vi.useFakeTimers({ now: new Date(time), toFake: ['Date'] });
      const service = createService([latte], [], priceSpecification);
      const [item] = await service.resolveOrderItems(
        'org',
        [cartItemOf()],
        'counter',
      );
      return item.unitPrice;
    };

    const june = {
      price: '80.00',
      validFrom: '2026-06-01',
      validThrough: '2026-06-30',
    };

    afterEach(() => {
      vi.useRealTimers();
    });

    it.each([
      ['2026-05-31T23:59:59+08:00', '100.00'],
      ['2026-06-01T00:00:00+08:00', '80.00'],
      ['2026-06-30T23:59:59+08:00', '80.00'],
      ['2026-07-01T00:00:00+08:00', '100.00'],
    ])('%s 的單價為 %s', async (time, unitPrice) => {
      expect(await unitPriceAt(time, june)).toBe(unitPrice);
    });

    it.each([
      ['2026-06-01T00:00:00+08:00', '80.00'],
      ['2026-06-01T23:59:59+08:00', '80.00'],
      ['2026-06-02T00:00:00+08:00', '100.00'],
    ])('單日促銷在 %s 的單價為 %s', async (time, unitPrice) => {
      expect(
        await unitPriceAt(time, {
          price: '80.00',
          validFrom: '2026-06-01',
          validThrough: '2026-06-01',
        }),
      ).toBe(unitPrice);
    });

    it('沒有結束日的促銷開始後一直有效', async () => {
      expect(
        await unitPriceAt('2030-01-01T12:00:00+08:00', {
          price: '80.00',
          validFrom: '2026-06-01',
        }),
      ).toBe('80.00');
    });

    it('沒有開始日的促銷到結束日當天都有效', async () => {
      expect(
        await unitPriceAt('2026-06-30T23:59:59+08:00', {
          price: '80.00',
          validThrough: '2026-06-30',
        }),
      ).toBe('80.00');
    });

    it('舊資料的日期時間取其平台時區日期', async () => {
      expect(
        await unitPriceAt('2026-06-30T23:00:00+08:00', {
          price: '80.00',
          validFrom: '2026-05-31T16:00:00Z',
          validThrough: '2026-06-30T00:00:00+08:00',
        }),
      ).toBe('80.00');
    });

    it('舊資料 UTC 時間跨到隔天時，以平台時區日期判斷起日', async () => {
      expect(
        await unitPriceAt('2026-05-31T23:00:00+08:00', {
          price: '80.00',
          validFrom: '2026-05-31T16:00:00Z',
        }),
      ).toBe('100.00');
    });

    it('舊資料 UTC 時間跨到隔天時，以平台時區日期判斷訖日', async () => {
      expect(
        await unitPriceAt('2026-06-01T12:00:00+08:00', {
          price: '80.00',
          validThrough: '2026-05-31T16:00:00Z',
        }),
      ).toBe('80.00');
    });

    it.each([
      '2026-W01',
      '20260601',
      '2026-06-01T00:00:00',
      '2026-06-01 00:00Z',
    ])('無法解析的日期 %s 不套用促銷價', async (validFrom) => {
      expect(
        await unitPriceAt('2026-06-15T12:00:00+08:00', {
          price: '80.00',
          validFrom,
        }),
      ).toBe('100.00');
    });
  });
});

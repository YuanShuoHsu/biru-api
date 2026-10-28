import { BadRequestException } from '@nestjs/common';
import type { I18nService } from 'nestjs-i18n';

import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import type { I18nTranslations } from '../generated/i18n.generated.js';

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

const createService = (menuItems: object[]) => {
  const db = {
    query: {
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
          })),
        ),
      },
    },
  };

  return new OrderPricingService(
    db as unknown as DrizzleDB,
    {
      t: (key: string, options?: { args?: { name?: string } }) =>
        options?.args?.name ? `${key}:${options.args.name}` : key,
    } as unknown as I18nService<I18nTranslations>,
  );
};

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
});

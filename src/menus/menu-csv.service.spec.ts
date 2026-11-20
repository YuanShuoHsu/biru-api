import { readFileSync } from 'node:fs';

import type { I18nService } from 'nestjs-i18n';

import type { I18nTranslations } from '../generated/i18n.generated.js';

import { MenuCsvService } from './menu-csv.service.js';
import type { PublicMenusService } from './menus-public.service.js';

const translations = JSON.parse(
  readFileSync(new URL('../i18n/zh-TW/common.json', import.meta.url), 'utf8'),
) as Record<string, unknown>;

const i18n = {
  t: (key: string) =>
    key
      .split('.')
      .slice(1)
      .reduce<unknown>(
        (node, part) => (node as Record<string, unknown>)[part],
        translations,
      ),
} as unknown as I18nService<I18nTranslations>;

describe('MenuCsvService', () => {
  const publicMenusService = { findOrderMenu: vi.fn() };
  const service = new MenuCsvService(
    i18n,
    publicMenusService as unknown as PublicMenusService,
  );

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('writes one row per order-menu item with its list price and options', async () => {
    publicMenusService.findOrderMenu.mockResolvedValue({
      sections: [
        {
          name: '咖啡',
          menuItems: [
            {
              name: '拿鐵',
              description: '濃縮, 鮮奶',
              offers: [{ price: '120.00' }],
              modifierGroups: [
                {
                  displayName: '尺寸',
                  modifiers: [
                    { displayName: '中杯', priceAdjustment: null },
                    { displayName: '大杯', priceAdjustment: '10.00' },
                  ],
                },
                {
                  displayName: '奶',
                  modifiers: [
                    { displayName: '鮮奶', priceAdjustment: '0.00' },
                    { displayName: '脫脂', priceAdjustment: '-5.50' },
                  ],
                },
              ],
            },
          ],
        },
        {
          name: '甜點',
          menuItems: [
            {
              name: '=布朗尼',
              description: null,
              offers: [],
              modifierGroups: [],
            },
          ],
        },
      ],
    });

    const csv = await service.orderMenu('store');

    expect(publicMenusService.findOrderMenu).toHaveBeenCalledWith(
      'store',
      'zh-TW',
    );
    expect(csv.split('\r\n')).toEqual([
      '﻿分類,品項,描述,價格,選項',
      '咖啡,拿鐵,"濃縮, 鮮奶",120,尺寸: 中杯 / 大杯 +10; 奶: 鮮奶 / 脫脂 -5.5',
      "甜點,'=布朗尼,,,",
      '',
    ]);
  });

  it('writes only the header for a store without a menu', async () => {
    publicMenusService.findOrderMenu.mockResolvedValue(null);

    expect(await service.orderMenu('store')).toBe(
      '﻿分類,品項,描述,價格,選項\r\n',
    );
  });
});

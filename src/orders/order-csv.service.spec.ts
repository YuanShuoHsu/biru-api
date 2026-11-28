import { readFileSync } from 'node:fs';

import type { I18nService } from 'nestjs-i18n';

import { languagesEnum } from '../db/schema/enums.js';
import { orderStatusEnum } from '../db/schema/orders.js';
import type { I18nTranslations } from '../generated/i18n.generated.js';

import { OrderCsvService } from './order-csv.service.js';
import type { OrdersService } from './orders.service.js';

const translations = (lang: string) =>
  JSON.parse(
    readFileSync(
      new URL(`../i18n/${lang}/common.json`, import.meta.url),
      'utf8',
    ),
  ) as { reports: Record<string, Record<string, string>> };

const i18n = {
  t: (key: string, { lang }: { lang: string }) =>
    key
      .split('.')
      .slice(1)
      .reduce<unknown>(
        (node, part) => (node as Record<string, unknown>)[part],
        translations(lang),
      ),
} as unknown as I18nService<I18nTranslations>;

describe('order csv labels', () => {
  it.each(languagesEnum.enumValues)('%s labels every order status', (lang) => {
    expect(
      Object.keys(translations(lang).reports.orderStatuses).sort(),
    ).toEqual([...orderStatusEnum.enumValues].sort());
  });
});

describe('OrderCsvService', () => {
  const ordersService = { exportOrders: vi.fn() };
  const service = new OrderCsvService(
    i18n,
    ordersService as unknown as OrdersService,
  );
  const actor = { id: 'staff', name: 'Staff', email: 'staff@example.com' };

  it('passes the filters and actor on, translates headers and enums and writes Taiwan time', async () => {
    ordersService.exportOrders.mockResolvedValue([
      {
        orderNumber: 'A001',
        createdAt: new Date('2026-11-18T16:30:05Z'),
        mode: 'dineIn',
        tableNumber: 3,
        orderStatus: 'OrderDelivered',
        paymentMethod: 'Cash',
        paymentDate: new Date('2026-11-18T16:31:00Z'),
        pickupTime: null,
        subtotal: '150.00',
        discount: '20.00',
        total: '130.00',
        customer: { name: '=Amy', telephone: '0912345678', email: null },
      },
    ]);
    const query = { quickFilterValue: 'Amy' };

    const csv = await service.orders('biru', query, actor);

    expect(ordersService.exportOrders).toHaveBeenCalledWith(
      'biru',
      query,
      actor,
    );
    expect(csv.split('\r\n')).toEqual([
      '﻿訂單編號,建立時間,點餐方式,桌號,訂單狀態,付款方式,付款時間,取餐時間,小計,折扣,合計,顧客姓名,顧客電話,顧客電子信箱',
      "A001,2026-11-19 00:30:05,內用,3,已送達,現金,2026-11-19 00:31:00,,150.00,20.00,130.00,'=Amy,0912345678,",
      '',
    ]);
  });
});

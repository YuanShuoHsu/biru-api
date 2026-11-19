import { readFileSync } from 'node:fs';

import type { I18nService } from 'nestjs-i18n';

import { languagesEnum } from '../db/schema/enums.js';
import { wasteReasonEnum } from '../db/schema/inventory.js';
import type { I18nTranslations } from '../generated/i18n.generated.js';

import { INVENTORY_TRANSACTION_REASONS } from './dto/inventory-transaction-response.dto.js';
import { InventoryTransactionCsvService } from './inventory-transaction-csv.service.js';
import type { InventoryTransactionsService } from './inventory-transactions.service.js';

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

describe('inventory transaction csv labels', () => {
  it.each(languagesEnum.enumValues)(
    '%s labels every transaction reason and waste reason',
    (lang) => {
      const { inventoryTransactionReasons, wasteReasons } =
        translations(lang).reports;
      expect(Object.keys(inventoryTransactionReasons).sort()).toEqual(
        [...INVENTORY_TRANSACTION_REASONS].sort(),
      );
      expect(Object.keys(wasteReasons).sort()).toEqual(
        [...wasteReasonEnum.enumValues].sort(),
      );
    },
  );
});

describe('InventoryTransactionCsvService', () => {
  const inventoryTransactionsService = { findAllForExport: vi.fn() };
  const service = new InventoryTransactionCsvService(
    i18n,
    inventoryTransactionsService as unknown as InventoryTransactionsService,
  );
  const rows = [
    {
      balance: '1750.000',
      createdAt: new Date('2026-11-18T16:30:05Z'),
      note: '=過期',
      orderNumber: null,
      quantity: '-250.000',
      reason: 'waste',
      unitCost: '0.1',
      wasteReason: 'expired',
    },
    {
      balance: '2000.000',
      createdAt: new Date('2026-11-18T01:00:00Z'),
      note: null,
      orderNumber: 'A001',
      quantity: '-30.000',
      reason: 'consume',
      unitCost: '0.1',
      wasteReason: null,
    },
  ];

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('passes the filters on, translates headers and reasons and writes Taiwan time', async () => {
    inventoryTransactionsService.findAllForExport.mockResolvedValue(rows);
    const query = { quickFilterValue: 'A001' };

    const csv = await service.transactions('milk', query, true);

    expect(inventoryTransactionsService.findAllForExport).toHaveBeenCalledWith(
      'milk',
      query,
      true,
    );
    expect(csv.split('\r\n')).toEqual([
      '﻿原因,報廢原因,異動量,異動後庫存,單位成本,訂單編號,備註,建立時間',
      "報廢,過期,-250.000,1750.000,0.1,,'=過期,2026-11-19 00:30:05",
      '訂單耗用,,-30.000,2000.000,0.1,A001,,2026-11-18 09:00:00',
      '',
    ]);
  });

  it('leaves the unit cost column out without the purchasing permission', async () => {
    inventoryTransactionsService.findAllForExport.mockResolvedValue([rows[1]]);

    const csv = await service.transactions('milk', {}, false);

    expect(csv.split('\r\n').slice(0, 2)).toEqual([
      '﻿原因,報廢原因,異動量,異動後庫存,訂單編號,備註,建立時間',
      '訂單耗用,,-30.000,2000.000,A001,,2026-11-18 09:00:00',
    ]);
  });
});

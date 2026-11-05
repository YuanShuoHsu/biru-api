import { readFileSync } from 'node:fs';

import type { I18nService } from 'nestjs-i18n';

import { unitCodeEnum } from '../db/schema/inventory.js';
import { paymentMethodEnum } from '../db/schema/orders.js';
import { languagesEnum } from '../db/schema/enums.js';
import type { I18nTranslations } from '../generated/i18n.generated.js';

import type { InventoryReportService } from './inventory-report.service.js';
import { ReportCsvService, toCsv } from './report-csv.service.js';
import type { SalesReportService } from './sales-report.service.js';

const translations = (lang: string) =>
  JSON.parse(
    readFileSync(
      new URL(`../i18n/${lang}/common.json`, import.meta.url),
      'utf8',
    ),
  ) as Record<string, unknown>;

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

describe('report csv labels', () => {
  it.each(languagesEnum.enumValues)(
    '%s labels every payment method and unit',
    (lang) => {
      const { paymentMethods, units } = translations(lang).reports as Record<
        string,
        Record<string, string>
      >;
      expect(Object.keys(paymentMethods).sort()).toEqual(
        [...paymentMethodEnum.enumValues].sort(),
      );
      expect(Object.keys(units).sort()).toEqual(
        [...unitCodeEnum.enumValues].sort(),
      );
    },
  );
});

describe('toCsv', () => {
  it('starts with a BOM, quotes cells that need it and ends rows with CRLF', () => {
    expect(toCsv([['a,b', 'say "hi"', 'line\nbreak', 1, null]])).toBe(
      '\uFEFF"a,b","say ""hi""","line\nbreak",1,\r\n',
    );
  });

  it('defuses cells that a spreadsheet would run as a formula but keeps negative numbers', () => {
    expect(toCsv([['=SUM(A1)', '+1+1', '@cmd', '-1.500', -2]])).toBe(
      "\uFEFF'=SUM(A1),'+1+1,'@cmd,-1.500,-2\r\n",
    );
  });
});

describe('ReportCsvService', () => {
  const salesReportService = { getSalesReport: vi.fn() };
  const inventoryReportService = { getInventoryReport: vi.fn() };
  const service = new ReportCsvService(
    i18n,
    inventoryReportService as unknown as InventoryReportService,
    salesReportService as unknown as SalesReportService,
  );
  const range = {
    since: '2026-10-01T00:00:00+08:00',
    until: '2026-10-02T00:00:00+08:00',
  };
  const totals = {
    orders: 3,
    revenue: 300,
    discount: 10,
    refunded: 50,
    net: 250,
  };

  beforeEach(() => vi.clearAllMocks());

  it('labels order modes and appends the totals row', async () => {
    salesReportService.getSalesReport.mockResolvedValue({
      groupBy: 'mode',
      rows: [{ key: 'dineIn', ...totals }],
      totals,
    });

    await expect(
      service.sales('biru', { ...range, groupBy: 'mode' }),
    ).resolves.toBe(
      '\uFEFF點餐方式,訂單數,營收,折扣,退款,淨額\r\n' +
        '內用,3,300,10,50,250\r\n' +
        '合計,3,300,10,50,250\r\n',
    );
    expect(salesReportService.getSalesReport).toHaveBeenCalledWith('biru', {
      ...range,
      groupBy: 'mode',
    });
  });

  it('labels payment methods', async () => {
    salesReportService.getSalesReport.mockResolvedValue({
      groupBy: 'paymentMethod',
      rows: [
        { key: 'Credit', ...totals },
        { key: 'TWQR', ...totals },
      ],
      totals,
    });

    await expect(
      service.sales('biru', { ...range, groupBy: 'paymentMethod' }),
    ).resolves.toBe(
      '\uFEFF付款方式,訂單數,營收,折扣,退款,淨額\r\n' +
        '信用卡,3,300,10,50,250\r\n' +
        '行動支付,3,300,10,50,250\r\n' +
        '合計,3,300,10,50,250\r\n',
    );
  });

  it('names menu items, labels uncategorized rows and leaves the total quantity empty', async () => {
    salesReportService.getSalesReport.mockResolvedValue({
      groupBy: 'category',
      rows: [
        {
          key: 'section-1',
          name: { 'zh-TW': '咖啡' },
          quantity: 4,
          refundedQuantity: 1,
          ...totals,
        },
        {
          key: 'uncategorized',
          name: null,
          quantity: 1,
          refundedQuantity: 0,
          ...totals,
        },
      ],
      totals,
    });

    await expect(
      service.sales('biru', { ...range, groupBy: 'category' }),
    ).resolves.toBe(
      '\uFEFF分類,訂單數,份數,退款份數,營收,折扣,退款,淨額\r\n' +
        '咖啡,3,4,1,300,10,50,250\r\n' +
        '未分類,3,1,0,300,10,50,250\r\n' +
        '合計,3,,,300,10,50,250\r\n',
    );
  });

  it('writes one inventory row per ingredient with its unit', async () => {
    inventoryReportService.getInventoryReport.mockResolvedValue({
      rows: [
        {
          ingredientId: 'milk',
          name: { 'zh-TW': '牛奶' },
          unitCode: 'MLT',
          opening: '1000.000',
          received: '500.000',
          consumed: '300.000',
          adjusted: '-20.000',
          closing: '1180.000',
          theoreticalConsumption: '280.000',
          actualConsumption: '320.000',
          variance: '40.000',
        },
      ],
    });

    await expect(service.inventory('biru', range)).resolves.toBe(
      '\uFEFF食材,單位,期初,入庫,耗用,調整,期末,理論耗用,實際耗用,差異\r\n' +
        '牛奶,毫升,1000.000,500.000,300.000,-20.000,1180.000,280.000,320.000,40.000\r\n',
    );
  });
});

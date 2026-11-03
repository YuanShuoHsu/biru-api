import { Injectable } from '@nestjs/common';

import { I18nContext, I18nService } from 'nestjs-i18n';

import type { OrderMode } from '../db/schema/orders.js';
import type { I18nTranslations } from '../generated/i18n.generated.js';

import { toLanguage } from '../common/utils/language.js';
import { localize } from '../menus/menus-public.service.js';

import type { ReportRangeQueryDto } from './dto/report-range-query.dto.js';
import type { SalesReportQueryDto } from './dto/sales-report.dto.js';
import { InventoryReportService } from './inventory-report.service.js';
import {
  SalesReportService,
  UNCATEGORIZED_KEY,
  isItemGroupBy,
} from './sales-report.service.js';

type CsvCell = string | number | null | undefined;
type CsvColumn = keyof I18nTranslations['common']['reports']['csv'];

// https://owasp.org/www-community/attacks/CSV_Injection
const NUMERIC = /^-?\d+(\.\d+)?$/;
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

const csvCell = (value: CsvCell): string => {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (FORMULA_PREFIX.test(text) && !NUMERIC.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export const toCsv = (rows: CsvCell[][]): string =>
  `\uFEFF${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`;

@Injectable()
export class ReportCsvService {
  constructor(
    private readonly i18n: I18nService<I18nTranslations>,
    private readonly inventoryReportService: InventoryReportService,
    private readonly salesReportService: SalesReportService,
  ) {}

  async sales(
    organizationSlug: string,
    query: SalesReportQueryDto,
  ): Promise<string> {
    const { groupBy, rows, totals } =
      await this.salesReportService.getSalesReport(organizationSlug, query);
    const lang = toLanguage(I18nContext.current()?.lang);
    const t = (key: CsvColumn) =>
      this.i18n.t(`common.reports.csv.${key}`, { lang });
    const isItem = isItemGroupBy(groupBy);

    const label = (key: string, name: Parameters<typeof localize>[0]) => {
      switch (groupBy) {
        case 'mode':
          return this.i18n.t(`common.orderTickets.modes.${key as OrderMode}`, {
            lang,
          });
        case 'menuItem':
        case 'category':
          return key === UNCATEGORIZED_KEY
            ? t('uncategorized')
            : (localize(name, lang) ?? key);
        default:
          return key;
      }
    };
    const amounts = (row: typeof totals) => [
      row.revenue,
      row.discount,
      row.refunded,
      row.net,
    ];

    return toCsv([
      [
        t(groupBy),
        t('orders'),
        ...(isItem ? [t('quantity'), t('refundedQuantity')] : []),
        t('revenue'),
        t('discount'),
        t('refunded'),
        t('net'),
      ],
      ...rows.map((row) => [
        label(row.key, row.name),
        row.orders,
        ...(isItem ? [row.quantity, row.refundedQuantity] : []),
        ...amounts(row),
      ]),
      [
        t('total'),
        totals.orders,
        ...(isItem ? [null, null] : []),
        ...amounts(totals),
      ],
    ]);
  }

  async inventory(
    organizationSlug: string,
    query: ReportRangeQueryDto,
  ): Promise<string> {
    const { rows } = await this.inventoryReportService.getInventoryReport(
      organizationSlug,
      query,
    );
    const lang = toLanguage(I18nContext.current()?.lang);
    const t = (key: CsvColumn) =>
      this.i18n.t(`common.reports.csv.${key}`, { lang });
    const columns = [
      'opening',
      'received',
      'consumed',
      'adjusted',
      'closing',
      'theoreticalConsumption',
      'actualConsumption',
      'variance',
    ] as const;

    return toCsv([
      [t('ingredient'), t('unit'), ...columns.map(t)],
      ...rows.map((row) => [
        localize(row.name, lang),
        row.unitCode,
        ...columns.map((column) => row[column]),
      ]),
    ]);
  }
}

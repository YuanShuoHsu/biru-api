import { Injectable } from '@nestjs/common';

import { I18nContext, I18nService } from 'nestjs-i18n';

import { toPlatformTime } from '../common/constants/timezone.js';
import { toLanguage } from '../common/utils/language.js';
import type { I18nTranslations } from '../generated/i18n.generated.js';
import { toCsv, type CsvColumn } from '../reports/report-csv.service.js';

import type { OrderExportQueryDto } from './dto/order-pagination-query.dto.js';
import { OrdersService } from './orders.service.js';

const platformTime = (date: Date | null) =>
  date && toPlatformTime(date).toISOString().slice(0, 19).replace('T', ' ');

@Injectable()
export class OrderCsvService {
  constructor(
    private readonly i18n: I18nService<I18nTranslations>,
    private readonly ordersService: OrdersService,
  ) {}

  async orders(
    organizationSlug: string,
    query: OrderExportQueryDto,
    actor: { id: string; name: string; email: string },
  ): Promise<string> {
    const rows = await this.ordersService.exportOrders(
      organizationSlug,
      query,
      actor,
    );
    const lang = toLanguage(I18nContext.current()?.lang);
    const t = (key: CsvColumn) =>
      this.i18n.t(`common.reports.csv.${key}`, { lang });

    return toCsv([
      [
        t('orderNumber'),
        t('createdAt'),
        t('mode'),
        t('tableNumber'),
        t('orderStatus'),
        t('paymentMethod'),
        t('paymentDate'),
        t('pickupTime'),
        t('subtotal'),
        t('discount'),
        t('total'),
        t('customerName'),
        t('customerTelephone'),
        t('customerEmail'),
      ],
      ...rows.map((row) => [
        row.orderNumber,
        platformTime(row.createdAt),
        this.i18n.t(`common.orderTickets.modes.${row.mode}`, { lang }),
        row.tableNumber,
        this.i18n.t(`common.reports.orderStatuses.${row.orderStatus}`, {
          lang,
        }),
        this.i18n.t(`common.reports.paymentMethods.${row.paymentMethod}`, {
          lang,
        }),
        platformTime(row.paymentDate),
        platformTime(row.pickupTime),
        row.subtotal,
        row.discount,
        row.total,
        row.customer.name,
        row.customer.telephone,
        row.customer.email,
      ]),
    ]);
  }
}

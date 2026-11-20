import { Injectable } from '@nestjs/common';

import { I18nContext, I18nService } from 'nestjs-i18n';

import { toPlatformTime } from '../common/constants/timezone.js';
import { toLanguage } from '../common/utils/language.js';
import type { I18nTranslations } from '../generated/i18n.generated.js';
import { toCsv, type CsvColumn } from '../reports/report-csv.service.js';

import type { InventoryTransactionExportQueryDto } from './dto/inventory-transaction-pagination-query.dto.js';
import { InventoryTransactionsService } from './inventory-transactions.service.js';

@Injectable()
export class InventoryTransactionCsvService {
  constructor(
    private readonly i18n: I18nService<I18nTranslations>,
    private readonly inventoryTransactionsService: InventoryTransactionsService,
  ) {}

  async transactions(
    ingredientId: string,
    query: InventoryTransactionExportQueryDto,
    canReadPurchasing: boolean,
  ): Promise<string> {
    const rows = await this.inventoryTransactionsService.findAllForExport(
      ingredientId,
      query,
      canReadPurchasing,
    );
    const lang = toLanguage(I18nContext.current()?.lang);
    const t = (key: CsvColumn) =>
      this.i18n.t(`common.reports.csv.${key}`, { lang });

    return toCsv([
      [
        t('reason'),
        t('wasteReason'),
        t('quantityChange'),
        t('balance'),
        ...(canReadPurchasing ? [t('unitCost')] : []),
        t('orderNumber'),
        t('note'),
        t('createdAt'),
      ],
      ...rows.map((row) => [
        this.i18n.t(
          `common.reports.inventoryTransactionReasons.${row.reason}`,
          {
            lang,
          },
        ),
        row.wasteReason &&
          this.i18n.t(`common.reports.wasteReasons.${row.wasteReason}`, {
            lang,
          }),
        row.quantity,
        row.balance,
        ...(canReadPurchasing ? [row.unitCost] : []),
        row.orderNumber,
        row.note,
        toPlatformTime(row.createdAt)
          .toISOString()
          .slice(0, 19)
          .replace('T', ' '),
      ]),
    ]);
  }
}

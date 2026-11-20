import { Injectable } from '@nestjs/common';

import { I18nContext, I18nService } from 'nestjs-i18n';

import { toLanguage } from '../common/utils/language.js';
import type { I18nTranslations } from '../generated/i18n.generated.js';
import { toCsv, type CsvColumn } from '../reports/report-csv.service.js';

import { PublicMenusService } from './menus-public.service.js';

const signed = new Intl.NumberFormat('en', {
  signDisplay: 'exceptZero',
  useGrouping: false,
});

@Injectable()
export class MenuCsvService {
  constructor(
    private readonly i18n: I18nService<I18nTranslations>,
    private readonly publicMenusService: PublicMenusService,
  ) {}

  async orderMenu(organizationId: string): Promise<string> {
    const lang = toLanguage(I18nContext.current()?.lang);
    const menu = await this.publicMenusService.findOrderMenu(
      organizationId,
      lang,
    );
    const t = (key: CsvColumn) =>
      this.i18n.t(`common.reports.csv.${key}`, { lang });

    return toCsv([
      [
        t('category'),
        t('menuItem'),
        t('description'),
        t('price'),
        t('options'),
      ],
      ...(menu?.sections ?? []).flatMap((section) =>
        section.menuItems.map((item) => [
          section.name,
          item.name,
          item.description,
          item.offers[0]?.price && Number(item.offers[0].price),
          item.modifierGroups
            .map(
              ({ displayName, modifiers }) =>
                `${displayName}: ${modifiers
                  .map((modifier) =>
                    Number(modifier.priceAdjustment)
                      ? `${modifier.displayName} ${signed.format(Number(modifier.priceAdjustment))}`
                      : modifier.displayName,
                  )
                  .join(' / ')}`,
            )
            .join('; '),
        ]),
      ),
    ]);
  }
}

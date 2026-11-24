import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Inject, Injectable } from '@nestjs/common';

import { eq } from 'drizzle-orm';
import { I18nService } from 'nestjs-i18n';
import PDFDocument from 'pdfkit';

import { PRODUCT_NAME } from '../common/constants/product.js';
import type { Language } from '../db/schema/enums.js';
import { organization } from '../db/schema/organizations.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import { DRIZZLE } from '../drizzle/drizzle.module.js';
import type { I18nTranslations } from '../generated/i18n.generated.js';

import type { OrderMenuResponseDto } from './dto/order-menu-response.dto.js';
import { badRequestError, notFoundError } from './menu-errors.js';
import { PublicMenusService } from './menus-public.service.js';

type Cmyk = [number, number, number, number];
type Section = OrderMenuResponseDto['sections'][number];
type PdfLabel = 'addOns' | 'allergens' | 'currency' | 'option' | 'separator';

const FONT_DIR = join(process.cwd(), 'assets', 'fonts');
const REGULAR = 'NotoSansTC-Regular';
const BOLD = 'NotoSansTC-Bold';
export const MENU_PDF_LANGUAGES: Language[] = ['en', 'zh-TW'];

const BLUE_GREY: Cmyk = [62, 36, 31, 25];
const INK: Cmyk = [80, 57, 50, 55];
const MUTED: Cmyk = [67, 60, 58, 45];
const MILK_WHITE: Cmyk = [4, 3, 7, 0];

const mm = (value: number) => (value * 72) / 25.4;
const px = (value: number) => value * 0.75;

const MARGIN_X = mm(20);
const MARGIN_Y = mm(16);
const BLOCK_GAP = mm(8);
const ITEM_GAP = mm(3);
const COLUMN_GAP = mm(12);

@Injectable()
export class MenuPdfService {
  private readonly fonts = {
    [REGULAR]: readFileSync(join(FONT_DIR, `${REGULAR}.ttf`)),
    [BOLD]: readFileSync(join(FONT_DIR, `${BOLD}.ttf`)),
  };

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly i18n: I18nService<I18nTranslations>,
    private readonly publicMenusService: PublicMenusService,
  ) {}

  async orderMenu(organizationId: string, lang: Language): Promise<Buffer> {
    if (!MENU_PDF_LANGUAGES.includes(lang))
      throw badRequestError('menuPdfLanguageUnsupported');

    const [menu, store] = await Promise.all([
      this.publicMenusService.findOrderMenu(organizationId, lang),
      this.db.query.organization.findFirst({
        columns: { name: true },
        where: eq(organization.id, organizationId),
      }),
    ]);
    if (!menu || !store) throw notFoundError('menuNotFound');

    return this.render(store.name, menu, lang);
  }

  private render(
    storeName: string,
    menu: OrderMenuResponseDto,
    lang: Language,
  ): Promise<Buffer> {
    const t = (key: PdfLabel, args?: Record<string, string>) =>
      this.i18n.t(`common.menus.pdf.${key}`, { lang, args });
    const price = new Intl.NumberFormat(lang);
    const surcharge = new Intl.NumberFormat(lang, {
      signDisplay: 'exceptZero',
    });
    const withSurcharge = (name: string, amount: string | null) =>
      Number(amount)
        ? `${name}\u00a0${surcharge.format(Number(amount))}`
        : name;
    const option = (name: string, values: string[]) =>
      t('option', { name, values: values.join(t('separator')) });

    const doc = new PDFDocument({
      size: 'A4',
      margin: 0,
      lang,
      info: { Title: storeName },
    });
    doc.registerFont(REGULAR, this.fonts[REGULAR]);
    doc.registerFont(BOLD, this.fonts[BOLD]);

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const output = new Promise<Buffer>((resolve) =>
      doc.on('end', () => resolve(Buffer.concat(chunks))),
    );

    const { width: pageWidth, height: pageHeight } = doc.page;
    const width = pageWidth - MARGIN_X * 2;
    // https://github.com/foliojs/pdfkit/blob/v0.21.0/docs/vector.md#color
    const style = (font: string, size: number, color: Cmyk) =>
      doc.font(font).fontSize(size).fillColor(color);

    doc.fillColor(MILK_WHITE).rect(0, 0, pageWidth, pageHeight).fill();

    const currencyName =
      new Intl.DisplayNames([lang], { type: 'currency' }).of(menu.currency) ??
      menu.currency;
    style(REGULAR, px(11), MUTED);
    const footerY = pageHeight - MARGIN_Y - doc.currentLineHeight();
    doc.text(t('currency', { currency: currencyName }), MARGIN_X, footerY, {
      lineBreak: false,
    });
    doc.text(t('allergens'), MARGIN_X, footerY, { width, align: 'right' });

    let y = MARGIN_Y;
    // https://github.com/foliojs/pdfkit/blob/v0.21.0/docs/text.md#text-measurements
    const paragraph = (
      text: string,
      x: number,
      options: PDFKit.Mixins.TextOptions,
      draw = true,
    ) => {
      const height = doc.heightOfString(text, options);
      if (draw) doc.text(text, x, y, options);
      y += height;
    };

    style(BOLD, px(34), BLUE_GREY);
    paragraph(storeName, MARGIN_X, { width, characterSpacing: px(34) * 0.3 });
    y += px(6);
    style(REGULAR, px(12), BLUE_GREY);
    paragraph(PRODUCT_NAME.toUpperCase(), MARGIN_X, {
      width,
      characterSpacing: px(12) * 0.4,
    });

    const columnWidth = (width - COLUMN_GAP) / 2;
    const columnTop = y + BLOCK_GAP;
    const columnHeight = footerY - BLOCK_GAP - columnTop;

    const drawSection = (
      section: Section,
      x: number,
      top: number,
      draw: boolean,
    ) => {
      y = top;
      style(BOLD, px(15), BLUE_GREY);
      paragraph(
        section.name,
        x,
        { width: columnWidth, characterSpacing: px(15) * 0.3 },
        draw,
      );
      y += mm(2);
      if (draw)
        doc
          .strokeColor(BLUE_GREY)
          .lineWidth(px(1))
          .moveTo(x, y)
          .lineTo(x + columnWidth, y)
          .stroke();
      y += px(1);
      if (section.description) {
        y += ITEM_GAP;
        style(REGULAR, px(12.5), MUTED);
        paragraph(section.description, x, { width: columnWidth }, draw);
      }

      for (const item of section.menuItems) {
        y += ITEM_GAP;
        const listPrice = item.offers[0]?.price;
        const priceText = listPrice ? price.format(Number(listPrice)) : '';
        style(REGULAR, px(16), INK);
        const nameOptions = {
          width: columnWidth - doc.widthOfString(priceText) - mm(4),
        };
        if (draw)
          doc.text(priceText, x, y, { width: columnWidth, align: 'right' });
        paragraph(item.name, x, nameOptions, draw);

        const addOnItems = [
          ...new Map(
            item.addOns
              .flatMap(({ menuItems }) => menuItems)
              .map((addOn) => [addOn.id, addOn]),
          ).values(),
        ];
        const notes = [
          ...item.modifierGroups
            .filter(({ modifiers }) => modifiers.length > 0)
            .map(({ displayName, modifiers }) =>
              option(
                displayName,
                modifiers.map((modifier) =>
                  withSurcharge(modifier.displayName, modifier.priceAdjustment),
                ),
              ),
            ),
          ...(addOnItems.length > 0
            ? [
                option(
                  t('addOns'),
                  addOnItems.map((addOn) =>
                    withSurcharge(addOn.name, addOn.offers[0]?.price ?? null),
                  ),
                ),
              ]
            : []),
        ];
        style(REGULAR, px(12.5), MUTED);
        for (const text of [item.description, notes.join('\n')]) {
          if (!text) continue;
          y += mm(1);
          paragraph(text, x, { width: columnWidth }, draw);
        }
      }

      return y - top;
    };

    const heights = menu.sections.map((section) =>
      drawSection(section, MARGIN_X, 0, false),
    );
    const stackHeight = (stack: number[]) =>
      stack.reduce((sum, height) => sum + height + BLOCK_GAP, -BLOCK_GAP);
    const [split, tallest] = heights.reduce<[number, number]>(
      (best, _, index) => {
        const height = Math.max(
          stackHeight(heights.slice(0, index)),
          stackHeight(heights.slice(index)),
        );
        return height < best[1] ? [index, height] : best;
      },
      [heights.length, stackHeight(heights)],
    );
    if (tallest > columnHeight) throw badRequestError('menuPdfTooLong');

    [menu.sections.slice(0, split), menu.sections.slice(split)].forEach(
      (column, index) => {
        const x = MARGIN_X + index * (columnWidth + COLUMN_GAP);
        column.reduce(
          (top, section) =>
            top + drawSection(section, x, top, true) + BLOCK_GAP,
          columnTop,
        );
      },
    );

    doc.end();

    return output;
  }
}

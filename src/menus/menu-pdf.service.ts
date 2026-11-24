import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
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
import { createTextLayout, type TextStyle } from './menu-pdf-layout.js';
import { PublicMenusService } from './menus-public.service.js';

type Cmyk = [number, number, number, number];
type Section = OrderMenuResponseDto['sections'][number];
type PdfLabel = 'addOns' | 'allergens' | 'currency' | 'option' | 'separator';
type Glyphs = { hasGlyphForCodePoint: (codePoint: number) => boolean };

const require = createRequire(import.meta.url);
const fontkit = createRequire(require.resolve('pdfkit'))('fontkit') as {
  create: (buffer: Buffer) => Glyphs;
};

const FONT_DIR = join(process.cwd(), 'assets', 'fonts');
const REGULAR = 'Regular';
const BOLD = 'Bold';
export const MENU_PDF_FONT_FAMILIES: Record<Language, string> = {
  en: 'NotoSansTC',
  ja: 'NotoSansJP',
  ko: 'NotoSansKR',
  'zh-CN': 'NotoSansSC',
  'zh-TW': 'NotoSansTC',
};
const FALLBACK_FONT_FAMILIES = [
  'NotoSansTC',
  'NotoSansSC',
  'NotoSansJP',
  'NotoSansKR',
];

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
const NOTE_GAP = mm(6);

// https://printtechnologies.org/standards/files/pdf-x-application-notes_v4-sep06.pdf
// https://printtechnologies.org/standards/files/technote5413.pdf
// https://registry.color.org/cmyk-registry/fogra39
const FOGRA39_OUTPUT_INTENT = {
  Type: 'OutputIntent',
  S: 'GTS_PDFX',
  OutputConditionIdentifier: new String('FOGRA39'),
  RegistryName: new String('http://www.color.org'),
  OutputCondition: new String(
    'Offset commercial and specialty printing according to ISO 12647-2, paper type 1 or 2 (gloss or matte coated offset, 115 g/m2), screen frequency 60/cm',
  ),
  Info: new String('ISO 12647-2:2004 / Amd 1'),
};
// PDFKit 會把字串型的 Info 值寫成 PDF 字串，PDF/X 的 Trapped 必須是名稱 /False
const TRAPPED_FALSE = {
  [Symbol.toStringTag]: 'PDFName',
  toString: () => '/False',
};

@Injectable()
export class MenuPdfService {
  private readonly fonts = new Map<string, { file: Buffer; glyphs: Glyphs }>();

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly i18n: I18nService<I18nTranslations>,
    private readonly publicMenusService: PublicMenusService,
  ) {}

  async orderMenu(organizationId: string, lang: Language): Promise<Buffer> {
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

  private font(name: string) {
    const cached = this.fonts.get(name);
    if (cached) return cached;

    const file = readFileSync(join(FONT_DIR, `${name}.ttf`));
    const font = { file, glyphs: fontkit.create(file) };
    this.fonts.set(name, font);
    return font;
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

    const createdAt = new Date();
    const doc = new PDFDocument({
      size: 'A4',
      margin: 0,
      lang,
      pdfVersion: '1.4',
      info: {
        Title: storeName,
        CreationDate: createdAt,
        ModDate: createdAt,
        GTS_PDFXVersion: 'PDF/X-1a:2003',
        Trapped: TRAPPED_FALSE,
      } as PDFKit.DocumentInfo,
    });
    (
      doc as unknown as { _root: { data: Record<string, unknown> } }
    )._root.data.OutputIntents = [FOGRA39_OUTPUT_INTENT];

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const output = new Promise<Buffer>((resolve) =>
      doc.on('end', () => resolve(Buffer.concat(chunks))),
    );

    const { width: pageWidth, height: pageHeight } = doc.page;
    const pageDictionary = doc.page.dictionary.data as Record<string, unknown>;
    pageDictionary.TrimBox = [0, 0, pageWidth, pageHeight];
    delete pageDictionary.UserUnit;
    const width = pageWidth - MARGIN_X * 2;
    // https://github.com/foliojs/pdfkit/blob/v0.21.0/docs/vector.md#color
    let weight = REGULAR;
    const style = (fontWeight: string, size: number, color: Cmyk) => {
      weight = fontWeight;
      doc.fontSize(size).fillColor(color);
    };
    const families = [
      ...new Set([MENU_PDF_FONT_FAMILIES[lang], ...FALLBACK_FONT_FAMILIES]),
    ];
    const registered = new Set<string>();
    const fontOf = (char: string) => {
      const codePoint = char.codePointAt(0) ?? 0;
      return families
        .map((family) => `${family}-${weight}`)
        .find((name) => this.font(name).glyphs.hasGlyphForCodePoint(codePoint));
    };
    const { layout, draw: drawLines } = createTextLayout(doc, (text) => {
      const pieces = Array.from(text, (char) => ({ char, font: fontOf(char) }));
      const unsupported = pieces.filter(({ font }) => !font);
      if (unsupported.length > 0)
        throw badRequestError('menuPdfUnsupportedCharacter', {
          text: [...new Set(unsupported.map(({ char }) => char))].join(' '),
        });

      return pieces.map(({ char, font = '' }) => {
        if (!registered.has(font)) {
          doc.registerFont(font, this.font(font).file);
          registered.add(font);
        }
        return { char, font };
      });
    });

    doc.fillColor(MILK_WHITE).rect(0, 0, pageWidth, pageHeight).fill();

    const currencyName =
      new Intl.DisplayNames([lang], { type: 'currency' }).of(menu.currency) ??
      menu.currency;
    style(REGULAR, px(11), MUTED);
    const currencyNote = layout(t('currency', { currency: currencyName }), {
      width,
    });
    const footerY = pageHeight - MARGIN_Y - currencyNote.height;
    drawLines(currencyNote.lines, MARGIN_X, footerY, { width });
    drawLines(layout(t('allergens'), { width }).lines, MARGIN_X, footerY, {
      width,
      align: 'right',
    });

    let y = MARGIN_Y;
    const paragraph = (
      text: string,
      x: number,
      textStyle: TextStyle,
      draw = true,
    ) => {
      const { lines, height } = layout(text, textStyle);
      if (draw) drawLines(lines, x, y, textStyle);
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

    const notesOf = (item: Section['menuItems'][number]) => {
      const addOnItems = [
        ...new Map(
          item.addOns
            .flatMap(({ menuItems }) => menuItems)
            .map((addOn) => [addOn.id, addOn]),
        ).values(),
      ];
      return [
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
    };

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

      const itemNotes = section.menuItems.map((item) => [
        ...new Set(notesOf(item)),
      ]);
      const sharedNotes =
        itemNotes.length > 1
          ? itemNotes[0].filter((note) =>
              itemNotes.every((notes) => notes.includes(note)),
            )
          : [];

      for (const [index, item] of section.menuItems.entries()) {
        y += ITEM_GAP;
        const listPrice = item.offers[0]?.price;
        const priceText = listPrice ? price.format(Number(listPrice)) : '';
        style(REGULAR, px(16), INK);
        const priceStyle: TextStyle = { width: columnWidth, align: 'right' };
        const priceLayout = layout(priceText, priceStyle);
        const name = layout(item.name, {
          width: columnWidth - (priceLayout.lines[0]?.width ?? 0) - mm(4),
        });
        if (draw) {
          drawLines(priceLayout.lines, x, y, priceStyle);
          drawLines(name.lines, x, y, { width: columnWidth });
        }
        y += Math.max(priceLayout.height, name.height);

        const notes = itemNotes[index].filter(
          (note) => !sharedNotes.includes(note),
        );
        style(REGULAR, px(12.5), MUTED);
        for (const text of [item.description, notes.join('\n')]) {
          if (!text) continue;
          y += mm(1);
          paragraph(text, x, { width: columnWidth }, draw);
        }
      }

      if (sharedNotes.length > 0) {
        y += NOTE_GAP;
        style(REGULAR, px(12.5), MUTED);
        paragraph(sharedNotes.join('\n'), x, { width: columnWidth }, draw);
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

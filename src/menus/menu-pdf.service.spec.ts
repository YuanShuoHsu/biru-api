import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { inflateSync } from 'node:zlib';

import type { HttpException } from '@nestjs/common';
import { I18nContext, type I18nService } from 'nestjs-i18n';
import PDFDocument from 'pdfkit';

import { languagesEnum } from '../db/schema/enums.js';
import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import type { I18nTranslations } from '../generated/i18n.generated.js';

import type { OrderMenuResponseDto } from './dto/order-menu-response.dto.js';
import { MENU_PDF_FONT_FAMILIES, MenuPdfService } from './menu-pdf.service.js';
import type { PublicMenusService } from './menus-public.service.js';

const translationsOf = (lang: string) =>
  JSON.parse(
    readFileSync(
      new URL(`../i18n/${lang}/common.json`, import.meta.url),
      'utf8',
    ),
  ) as Record<string, unknown>;

const t = vi.fn(
  (key: string, { lang, args }: { lang: string; args?: object }) =>
    Object.entries(args ?? {}).reduce(
      (text, [name, value]) => text.replace(`{${name}}`, String(value)),
      key
        .split('.')
        .slice(1)
        .reduce<unknown>(
          (node, part) => (node as Record<string, unknown>)[part],
          translationsOf(lang),
        ) as string,
    ),
);
const i18n = { t } as unknown as I18nService<I18nTranslations>;

const require = createRequire(import.meta.url);
const fontkit = createRequire(require.resolve('pdfkit'))('fontkit') as {
  create: (buffer: Buffer) => {
    hasGlyphForCodePoint: (codePoint: number) => boolean;
  };
};
const fontsOf = (family: string) =>
  ['Regular', 'Bold'].map((weight) =>
    fontkit.create(readFileSync(`assets/fonts/${family}-${weight}.ttf`)),
  );

const menuOf = (sections: { name: string; items: number }[]) =>
  ({
    currency: 'TWD',
    sections: sections.map(({ name, items }) => ({
      name,
      description: null,
      menuItems: Array.from({ length: items }, (_, index) => ({
        name: `${name} ${index + 1}`,
        description: '冷萃麥茶加氣泡水，上層鋪咖啡奶蓋。',
        offers: [{ price: '140.00' }],
        modifierGroups: [
          {
            displayName: '辣度',
            modifiers: [
              { displayName: '不辣', priceAdjustment: null },
              { displayName: '大辣', priceAdjustment: '10.00' },
            ],
          },
        ],
        addOns: [
          {
            menuItems: [
              { id: 'noodle', name: '加麵', offers: [{ price: '20.00' }] },
            ],
          },
        ],
      })),
    })),
  }) as unknown as OrderMenuResponseDto;

const contentOf = (pdf: Buffer) => {
  const raw = pdf.toString('latin1');
  return [...raw.matchAll(/stream\r?\n/g)]
    .map(({ index }, i, all) => {
      const start = index + all[i][0].length;
      const body = pdf.subarray(start, raw.indexOf('endstream', start));
      try {
        return inflateSync(body).toString('latin1');
      } catch {
        return '';
      }
    })
    .join('\n');
};

const responseOf = (error: unknown) =>
  [
    (error as HttpException).getStatus(),
    (error as HttpException).getResponse(),
  ] as const;

const mm = (value: number) => (value * 72) / 25.4;
const COLUMN_WIDTH = (595.28 - mm(40) - mm(12)) / 2;
const COLUMN_RIGHTS = [mm(20) + COLUMN_WIDTH, 595.28 - mm(20)];

const recordText = () => {
  const original = PDFDocument.prototype.text;
  const drawn: {
    text: string;
    column: number;
    x: number;
    y: number;
    right: number;
    bottom: number;
  }[] = [];
  vi.spyOn(PDFDocument.prototype, 'text').mockImplementation(function (
    this: PDFKit.PDFDocument,
    text: string,
    x: number,
    y: number,
    options?: PDFKit.Mixins.TextOptions,
  ) {
    drawn.push({
      text,
      column: x < COLUMN_RIGHTS[0] ? 0 : 1,
      x,
      y,
      right: x + this.widthOfString(text, options),
      bottom: y + this.currentLineHeight(true),
    });
    return original.call(this, text, x, y, options);
  } as never);

  const lines = (column: number) => {
    const rows = new Map<number, typeof drawn>();
    for (const entry of drawn.filter((run) => run.column === column))
      rows.set(entry.y, [...(rows.get(entry.y) ?? []), entry]);
    return [...rows]
      .sort(([a], [b]) => a - b)
      .map(([y, runs]) => ({
        y,
        text: runs
          .sort((a, b) => a.x - b.x)
          .map(({ text }) => text)
          .join(''),
      }));
  };
  return { drawn, lines };
};

describe('MenuPdfService', () => {
  const publicMenusService = { findOrderMenu: vi.fn() };
  const findFirst = vi.fn();
  const service = new MenuPdfService(
    { query: { organization: { findFirst } } } as unknown as DrizzleDB,
    i18n,
    publicMenusService as unknown as PublicMenusService,
  );

  beforeEach(() => {
    findFirst.mockResolvedValue({ name: '碧露 信義店' });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('draws the order menu on one A4 page in CMYK with the font embedded', async () => {
    publicMenusService.findOrderMenu.mockResolvedValue(
      menuOf([
        { name: '飲品', items: 3 },
        { name: '甜點', items: 2 },
      ]),
    );

    const pdf = await service.orderMenu('org-1', 'zh-TW');
    const raw = pdf.toString('latin1');
    const content = contentOf(pdf);

    expect(publicMenusService.findOrderMenu).toHaveBeenCalledWith(
      'org-1',
      'zh-TW',
    );
    expect(raw.startsWith('%PDF-')).toBe(true);
    expect(raw).toMatch(/\/Type \/Pages\n\/Count 1\n/);
    expect(raw).toContain('/MediaBox [0 0 595.28 841.89]');
    expect(raw).toContain('/FontFile2');
    expect(content).toContain('/DeviceCMYK cs\n0.04 0.03 0.07 0 scn');
    expect(content).toContain('/DeviceCMYK cs\n0.62 0.36 0.31 0.25 scn');
    expect(content).toContain('/DeviceCMYK CS\n0.62 0.36 0.31 0.25 SCN');
    expect(content).not.toContain('DeviceRGB');
  });

  it('marks the file as PDF/X-1a:2003 for the FOGRA39 printing condition', async () => {
    publicMenusService.findOrderMenu.mockResolvedValue(
      menuOf([{ name: '飲品', items: 2 }]),
    );

    const raw = (await service.orderMenu('org-1', 'zh-TW')).toString('latin1');
    const infoValue = (key: string) => {
      const [, id] = new RegExp(`/${key} (\\d+) 0 R`).exec(raw) ?? [];
      return new RegExp(`\\n${id} 0 obj\\n(.*)\\nendobj`).exec(raw)?.[1];
    };

    expect(raw.startsWith('%PDF-1.4\n')).toBe(true);
    expect(raw).toContain(
      [
        '/OutputIntents [<<',
        '/Type /OutputIntent',
        '/S /GTS_PDFX',
        '/OutputConditionIdentifier (FOGRA39)',
        '/RegistryName (http://www.color.org)',
      ].join('\n'),
    );
    expect(raw).not.toContain('/DestOutputProfile');
    expect(infoValue('GTS_PDFXVersion')).toBe('(PDF/X-1a:2003)');
    expect(infoValue('Trapped')).toBe('/False');
    expect(infoValue('Title')).toBeDefined();
    expect(infoValue('ModDate')).toBe(infoValue('CreationDate'));
    expect(raw).toMatch(/\/ID \[<[0-9a-f]+> <[0-9a-f]+>\]/);
    expect(raw).toContain('/TrimBox [0 0 595.28 841.89]');
    expect(raw).not.toContain('/UserUnit');
    expect(raw).not.toContain('DeviceRGB');
    expect(raw).not.toContain('/ExtGState');
    expect(raw).not.toContain('/Annots');
    expect(raw).not.toContain('/Group');
    expect(raw).not.toContain('/JavaScript');
  });

  it('refuses a menu that does not fit on one page', async () => {
    publicMenusService.findOrderMenu.mockResolvedValue(
      menuOf([{ name: '飲品', items: 40 }]),
    );

    const error: unknown = await service
      .orderMenu('org-1', 'en')
      .catch((caught: unknown) => caught);

    expect(responseOf(error)).toEqual([
      400,
      expect.objectContaining({ code: 'menuPdfTooLong' }),
    ]);
  });

  it.each(languagesEnum.enumValues)(
    'embeds the font of a %s menu',
    async (lang) => {
      publicMenusService.findOrderMenu.mockResolvedValue(
        menuOf([{ name: '飲品', items: 1 }]),
      );

      const raw = (await service.orderMenu('org-1', lang)).toString('latin1');

      expect(raw).toContain(`+${MENU_PDF_FONT_FAMILIES[lang]}-Regular`);
      expect(raw).toContain(`+${MENU_PDF_FONT_FAMILIES[lang]}-Bold`);
    },
  );

  it('answers 404 for a store without a menu', async () => {
    publicMenusService.findOrderMenu.mockResolvedValue(null);

    const error: unknown = await service
      .orderMenu('org-1', 'en')
      .catch((caught: unknown) => caught);

    expect(responseOf(error)).toEqual([
      404,
      expect.objectContaining({ code: 'menuNotFound' }),
    ]);
  });

  it('prints the option lines every item of a section shares once after its items', async () => {
    const menu = menuOf([
      { name: '義大利麵', items: 2 },
      { name: '甜點', items: 1 },
    ]);
    const [, pasta] = menu.sections[0].menuItems;
    pasta.addOns = [
      {
        menuItems: [{ id: 'egg', name: '加蛋', offers: [{ price: '15.00' }] }],
      },
    ] as unknown as typeof pasta.addOns;
    publicMenusService.findOrderMenu.mockResolvedValue(menu);
    const { lines } = recordText();

    await service.orderMenu('org-1', 'zh-TW');

    const texts = (column: number) => lines(column).map(({ text }) => text);
    const pastaLines = texts(0);
    const heading = pastaLines.indexOf('義大利麵');
    expect(pastaLines.slice(heading, heading + 8)).toEqual([
      '義大利麵',
      '義大利麵 1140',
      '冷萃麥茶加氣泡水，上層鋪咖啡奶蓋。',
      '加購：加麵\u00a0+20',
      '義大利麵 2140',
      '冷萃麥茶加氣泡水，上層鋪咖啡奶蓋。',
      '加購：加蛋\u00a0+15',
      '辣度：不辣・大辣\u00a0+10',
    ]);
    const dessertLines = texts(1);
    const dessert = dessertLines.indexOf('甜點');
    expect(dessertLines.slice(dessert, dessert + 5)).toEqual([
      '甜點',
      '甜點 1140',
      '冷萃麥茶加氣泡水，上層鋪咖啡奶蓋。',
      '辣度：不辣・大辣\u00a0+10',
      '加購：加麵\u00a0+20',
    ]);
  });

  it('wraps long text within its column', async () => {
    const menu = menuOf([{ name: '飲品', items: 2 }]);
    menu.sections[0].menuItems[0].description =
      'Cold brew barley tea topped with sparkling water and a silky coffee milk foam, served iced only. 冷萃麥茶加氣泡水，上層鋪咖啡奶蓋。僅供冷飲，不提供熱飲。';
    publicMenusService.findOrderMenu.mockResolvedValue(menu);
    const { drawn, lines } = recordText();

    await service.orderMenu('org-1', 'zh-TW');

    const description = lines(0).filter(({ text }) =>
      /Cold|barley|foam|iced|冷萃|熱飲/.test(text),
    );
    expect(description.length).toBeGreaterThan(2);
    expect(description.map(({ text }) => text).join(' ')).toContain(
      'served iced only.',
    );
    for (const { text } of description) expect(text).not.toMatch(/^ | $/);
    for (const { column, right } of drawn)
      expect(right).toBeLessThanOrEqual(COLUMN_RIGHTS[column] + 0.01);
  });

  it('keeps every line it draws above the footer when the page is nearly full', async () => {
    const render = async (items: number) => {
      publicMenusService.findOrderMenu.mockResolvedValue(
        menuOf([
          { name: '飲品', items },
          { name: '甜點', items },
        ]),
      );
      return service.orderMenu('org-1', 'zh-TW');
    };
    let items = 1;
    while (
      await render(items + 1).then(
        () => true,
        () => false,
      )
    )
      items += 1;
    const { drawn } = recordText();

    await render(items);

    const footerY = Math.max(...drawn.map(({ y }) => y));
    const content = drawn.filter(({ y }) => y < footerY);
    expect(
      Math.max(...content.map(({ bottom }) => bottom)),
    ).toBeLessThanOrEqual(footerY - mm(8) + 0.01);
    expect(
      responseOf(await render(items + 1).catch((caught: unknown) => caught)),
    ).toEqual([400, expect.objectContaining({ code: 'menuPdfTooLong' })]);
  });

  it('draws each character the language font lacks with the first font that has it', async () => {
    const menu = menuOf([{ name: '飲品', items: 2 }]);
    const [first] = menu.sections[0].menuItems;
    first.name = '碧露咖啡';
    first.addOns = [
      {
        menuItems: [
          { id: 'mushroom', name: '加野菇', offers: [{ price: '20.00' }] },
        ],
      },
    ] as unknown as typeof first.addOns;
    publicMenusService.findOrderMenu.mockResolvedValue(menu);
    const { lines } = recordText();

    const pdf = await service.orderMenu('org-1', 'ko');
    const raw = pdf.toString('latin1');
    const glyphIds = [...contentOf(pdf).matchAll(/^\[(.*)\] TJ$/gm)]
      .flatMap(([, array]) => [...array.matchAll(/<([0-9a-f]+)>/g)])
      .flatMap(([, hex]) => hex.match(/.{4}/g) ?? []);

    expect(raw).toContain('+NotoSansKR-Regular');
    expect(raw).toContain('+NotoSansTC-Regular');
    expect(glyphIds.length).toBeGreaterThan(0);
    expect(glyphIds).not.toContain('0000');
    expect(lines(0).map(({ text }) => text)).toEqual(
      expect.arrayContaining(['碧露咖啡140', '추가 구매: 加野菇\u00a0+20']),
    );
  });

  it('breaks Korean text only between words', async () => {
    const addOns = ['면 추가', '버섯 추가', '베이컨 추가 많이', '치킨 추가'];
    const menu = menuOf([{ name: '파스타', items: 1 }]);
    const [pasta] = menu.sections[0].menuItems;
    pasta.addOns = [
      {
        menuItems: addOns.map((name) => ({
          id: name,
          name,
          offers: [{ price: '20.00' }],
        })),
      },
    ] as unknown as typeof pasta.addOns;
    publicMenusService.findOrderMenu.mockResolvedValue(menu);
    const { lines } = recordText();

    await service.orderMenu('org-1', 'ko');

    const texts = lines(0).map(({ text }) => text);
    const start = texts.findIndex((text) => text.startsWith('추가 구매'));
    const note = texts.slice(start, start + 2);
    expect(note[1]).toMatch(/^\p{Script=Hangul}/u);
    const words = note.flatMap((text) => text.split(/[ ,:\u00a0]+/));
    for (const name of addOns.flatMap((addOn) => addOn.split(' ')))
      expect(words).toContain(name);
  });

  it('draws CR LF and tabs as line breaks and spaces, and keeps a blank line', async () => {
    const menu = menuOf([{ name: '飲品', items: 1 }]);
    menu.sections[0].menuItems[0].description =
      'Iced\tonly\r\nNo sugar\u0007\r\rAsk staff';
    publicMenusService.findOrderMenu.mockResolvedValue(menu);
    const { drawn, lines } = recordText();

    await service.orderMenu('org-1', 'en');

    const texts = lines(0);
    const yOf = (text: string) =>
      texts.find((line) => line.text === text)?.y ?? Number.NaN;
    const lineHeight =
      drawn.find(({ text }) => text === 'Iced only')!.bottom - yOf('Iced only');
    expect(yOf('No sugar') - yOf('Iced only')).toBeCloseTo(lineHeight);
    expect(yOf('Ask staff') - yOf('No sugar')).toBeCloseTo(lineHeight * 2);
  });

  it('refuses text no font can draw and names only those characters', async () => {
    vi.spyOn(I18nContext, 'current').mockReturnValue({
      t: (key: string, { args }: { args: object }) =>
        `${key} ${JSON.stringify(args)}`,
    } as unknown as I18nContext);
    const menu = menuOf([{ name: '飲品', items: 1 }]);
    menu.sections[0].menuItems[0].name = '拿鐵 \u{1F600} 好喝 \u{1F600}';
    publicMenusService.findOrderMenu.mockResolvedValue(menu);

    const error: unknown = await service
      .orderMenu('org-1', 'zh-TW')
      .catch((caught: unknown) => caught);

    expect(responseOf(error)).toEqual([
      400,
      expect.objectContaining({
        code: 'menuPdfUnsupportedCharacter',
        message: `common.menus.menuPdfUnsupportedCharacter ${JSON.stringify({ text: '\u{1F600}' })}`,
      }),
    ]);
  });

  it('lists an add-on reached twice once and skips option groups without options', async () => {
    const menu = menuOf([{ name: '義大利麵', items: 1 }]);
    const [item] = menu.sections[0].menuItems;
    item.modifierGroups.push({
      displayName: '醬料',
      modifiers: [],
    } as unknown as (typeof item.modifierGroups)[number]);
    item.addOns.push({
      menuItems: [
        { id: 'noodle', name: '加麵', offers: [{ price: '20.00' }] },
        { id: 'egg', name: '加蛋', offers: [{ price: '15.00' }] },
      ],
    } as unknown as (typeof item.addOns)[number]);
    publicMenusService.findOrderMenu.mockResolvedValue(menu);

    await service.orderMenu('org-1', 'zh-TW');

    const options = t.mock.calls
      .filter(([key]) => key === 'common.menus.pdf.option')
      .map(([, { args }]) => args as { name: string; values: string })
      .map(({ name, values }) => [name, values]);
    expect(Object.fromEntries(options)).toEqual({
      辣度: '不辣・大辣\u00a0+10',
      加購: '加麵\u00a0+20・加蛋\u00a0+15',
    });
  });

  it.each(languagesEnum.enumValues)(
    'has glyphs in both weights of its font for every %s label',
    (lang) => {
      const labels = Object.values(
        (translationsOf(lang).menus as { pdf: Record<string, string> }).pdf,
      );
      const text = [
        ...labels,
        new Intl.DisplayNames([lang], { type: 'currency' }).of('TWD'),
        new Intl.NumberFormat(lang, { signDisplay: 'exceptZero' }).format(
          1234567890,
        ),
        '\u00a0',
      ].join('');

      for (const font of fontsOf(MENU_PDF_FONT_FAMILIES[lang]))
        expect(
          Array.from(text).filter(
            (char) => !font.hasGlyphForCodePoint(char.codePointAt(0) ?? 0),
          ),
        ).toEqual([]);
    },
  );
});

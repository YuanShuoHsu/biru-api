import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

import type { HttpException } from '@nestjs/common';
import type { I18nService } from 'nestjs-i18n';

import type { DrizzleDB } from '../drizzle/drizzle.module.js';
import type { I18nTranslations } from '../generated/i18n.generated.js';

import type { OrderMenuResponseDto } from './dto/order-menu-response.dto.js';
import { MenuPdfService } from './menu-pdf.service.js';
import type { PublicMenusService } from './menus-public.service.js';

const translationsOf = (lang: string) =>
  JSON.parse(
    readFileSync(
      new URL(`../i18n/${lang}/common.json`, import.meta.url),
      'utf8',
    ),
  ) as Record<string, unknown>;

const i18n = {
  t: (key: string, { lang, args }: { lang: string; args?: object }) =>
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
} as unknown as I18nService<I18nTranslations>;

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
          { menuItems: [{ name: '加麵', offers: [{ price: '20.00' }] }] },
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

  it('refuses a menu that does not fit on one page', async () => {
    publicMenusService.findOrderMenu.mockResolvedValue(
      menuOf([{ name: '飲品', items: 40 }]),
    );

    const error: unknown = await service
      .orderMenu('org-1', 'en')
      .catch((caught: unknown) => caught);

    expect(responseOf(error)).toEqual([
      422,
      expect.objectContaining({ code: 'menuPdfTooLong' }),
    ]);
  });

  it.each(['ko', 'zh-CN'] as const)(
    'refuses %s, whose glyphs the font lacks',
    async (lang) => {
      const error: unknown = await service
        .orderMenu('org-1', lang)
        .catch((caught: unknown) => caught);

      expect(responseOf(error)).toEqual([
        400,
        expect.objectContaining({ code: 'menuPdfLanguageUnsupported' }),
      ]);
      expect(publicMenusService.findOrderMenu).not.toHaveBeenCalled();
    },
  );

  it('answers 404 for a store without a menu', async () => {
    publicMenusService.findOrderMenu.mockResolvedValue(null);

    const error: unknown = await service
      .orderMenu('org-1', 'ja')
      .catch((caught: unknown) => caught);

    expect(responseOf(error)).toEqual([
      404,
      expect.objectContaining({ code: 'menuNotFound' }),
    ]);
  });
});

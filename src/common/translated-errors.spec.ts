import { readdirSync, readFileSync } from 'node:fs';

const modulesWithErrorCodes = [
  'attendance',
  'banners',
  'coupons',
  'deleted-records',
  'inventory',
  'menus',
  'orders',
  'organizations',
  'points',
  'quant',
  'reports',
  'store-layout',
  'store-photos',
  'waitlist',
];

describe('翻譯過的錯誤都帶代碼', () => {
  it.each(modulesWithErrorCodes)(
    'src/%s 不再直接以翻譯訊息建立例外',
    (module) => {
      const offenders = readdirSync(`src/${module}`, { recursive: true })
        .map(String)
        .filter((file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'))
        .filter((file) =>
          /Exception\(\s*this\.(i18n\.)?t\(/.test(
            readFileSync(`src/${module}/${file}`, 'utf8'),
          ),
        );

      expect(offenders).toEqual([]);
    },
  );
});

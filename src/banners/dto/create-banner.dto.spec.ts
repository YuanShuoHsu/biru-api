import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateBannerDto, UpdateBannerDto } from './create-banner.dto.js';

const errorsOf = async (fields: Record<string, unknown>) =>
  (
    await validate(
      plainToInstance(CreateBannerDto, {
        image: 'data:image/png;base64,iVBORw0KGgo=',
        ...fields,
      }),
    )
  ).map(({ property }) => property);

describe('CreateBannerDto', () => {
  it('accepts an alt of 160 characters and rejects 161 in any language', async () => {
    expect(await errorsOf({ alt: { en: 'a'.repeat(160) } })).toEqual([]);
    expect(
      await errorsOf({ alt: { 'zh-TW': '橫幅', ko: '가'.repeat(161) } }),
    ).toEqual(['alt']);
  });

  it.each([
    'data:image/webp;base64,UklGRg==',
    'data:image/jpeg;base64,/9j/4AAQ',
  ])('accepts image %j', async (image) => {
    expect(await errorsOf({ image })).toEqual([]);
  });

  it.each([
    'data:image/png;base64,',
    'data:image/svg+xml;base64,PHN2Zz4=',
    'data:image/gif;base64,R0lGODlh',
    'data:image/avif;base64,AAAAIGZ0eXA=',
    'data:text/html;base64,PGgxPg==',
    'data:image/png,iVBORw0KGgo',
    'data:image/png;base64,iVBOR w0K',
    'https://example.com/banner.png',
  ])('rejects image %j', async (image) => {
    expect(await errorsOf({ image })).toEqual(['image']);
  });

  it.each([
    '/order',
    '/zh-TW/waitlist/biru?from=banner',
    'https://example.com/campaign',
    null,
  ])('accepts url %j', async (url) => {
    expect(await errorsOf({ url })).toEqual([]);
  });

  it.each([
    'http://example.com',
    '//evil.example.com',
    '/\\evil.example.com',
    'javascript:alert(1)',
    'https://',
    'order',
    '/order page',
  ])('rejects url %j', async (url) => {
    expect(await errorsOf({ url })).toEqual(['url']);
  });

  it.each(['startsAt', 'endsAt'])('accepts an offset %s', async (field) => {
    for (const value of [
      '2026-10-31T16:00:00.000Z',
      '2026-11-01T00:00:00+08:00',
      null,
    ])
      expect(await errorsOf({ [field]: value })).toEqual([]);
  });

  it.each([
    '2026-11-01',
    '2026-11-01T00:00:00',
    '2026-W01',
    '2026-02-30T00:00:00+08:00',
  ])('rejects %j, which has no offset or is not a real date', async (value) => {
    expect(await errorsOf({ startsAt: value })).toEqual(['startsAt']);
    expect(await errorsOf({ endsAt: value })).toEqual(['endsAt']);
  });

  it('accepts a sortOrder up to 9999 and rejects 10000', async () => {
    expect(await errorsOf({ sortOrder: 9999 })).toEqual([]);
    expect(await errorsOf({ sortOrder: 10000 })).toEqual(['sortOrder']);
  });

  it('turns an all-blank alt into null', () => {
    expect(
      plainToInstance(UpdateBannerDto, { alt: { en: ' ', 'zh-TW': '' } }).alt,
    ).toBeNull();
  });
});

describe('UpdateBannerDto', () => {
  const updateErrorsOf = async (fields: Record<string, unknown>) =>
    (await validate(plainToInstance(UpdateBannerDto, fields))).map(
      ({ property }) => property,
    );

  it.each(['image', 'isActive', 'sortOrder'])(
    'rejects null %s',
    async (field) => {
      expect(await updateErrorsOf({ [field]: null })).toEqual([field]);
    },
  );

  it.each(['alt', 'url', 'startsAt', 'endsAt'])(
    'accepts null %s',
    async (field) => {
      expect(await updateErrorsOf({ [field]: null })).toEqual([]);
    },
  );

  it('rejects a sortOrder over 9999', async () => {
    expect(await updateErrorsOf({ sortOrder: 10000 })).toEqual(['sortOrder']);
  });

  it('accepts a partial update', async () => {
    expect(await updateErrorsOf({ isActive: false })).toEqual([]);
  });
});

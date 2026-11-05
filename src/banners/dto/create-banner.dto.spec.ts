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
  it.each([
    'data:image/webp;base64,UklGRg==',
    'data:image/jpeg;base64,/9j/4AAQ',
  ])('accepts image %j', async (image) => {
    expect(await errorsOf({ image })).toEqual([]);
  });

  it.each([
    'data:image/png;base64,',
    'data:image/svg+xml;base64,PHN2Zz4=',
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

  it('requires startsAt before endsAt', async () => {
    expect(
      await errorsOf({
        startsAt: '2026-11-01T00:00:00Z',
        endsAt: '2026-10-01T00:00:00Z',
      }),
    ).toEqual(['endsAt']);
    expect(
      await errorsOf({
        startsAt: '2026-10-01T00:00:00Z',
        endsAt: '2026-11-01T00:00:00Z',
      }),
    ).toEqual([]);
  });

  it.each(['2026-10-31T16:00:00.000Z', '2026-11-01T00:00:00+08:00', null])(
    'accepts startsAt %j',
    async (startsAt) => {
      expect(await errorsOf({ startsAt })).toEqual([]);
    },
  );

  it.each([
    '2026-11-01',
    '2026-11-01T00:00:00',
    '2026-W01',
    '2026-02-30T00:00:00+08:00',
  ])(
    'rejects startsAt %j, which has no offset or is not a real date',
    async (startsAt) => {
      expect(await errorsOf({ startsAt })).toEqual(['startsAt']);
    },
  );

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

  it('accepts a partial update', async () => {
    expect(await updateErrorsOf({ isActive: false })).toEqual([]);
  });
});

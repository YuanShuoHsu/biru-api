import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateBannerDto, UpdateBannerDto } from './create-banner.dto.js';

const errorsOf = async (fields: Record<string, unknown>) =>
  (
    await validate(
      plainToInstance(CreateBannerDto, {
        image: 'data:image/png;base64,',
        ...fields,
      }),
    )
  ).map(({ property }) => property);

describe('CreateBannerDto', () => {
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

  it('turns an all-blank alt into null', () => {
    expect(
      plainToInstance(UpdateBannerDto, { alt: { en: ' ', 'zh-TW': '' } }).alt,
    ).toBeNull();
  });
});

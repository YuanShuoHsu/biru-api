import { readFileSync } from 'node:fs';

import { NotFoundException } from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';

import { languagesEnum } from '../db/schema/enums.js';

import { storePhotoErrorCodes, notFoundError } from './store-photo-errors.js';

const messagesOf = (language: string): Record<string, unknown> =>
  (
    JSON.parse(readFileSync(`src/i18n/${language}/common.json`, 'utf8')) as {
      storePhotos: Record<string, unknown>;
    }
  ).storePhotos;

describe('storePhotoErrorCodes', () => {
  it.each(languagesEnum.enumValues)('每個代碼在 %s 都有翻譯', (language) => {
    const messages = messagesOf(language);

    for (const code of storePhotoErrorCodes)
      expect(messages[code], code).toEqual(expect.stringMatching(/\S/));
  });
});

describe('notFoundError', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('回應帶代碼與目前語系的訊息', () => {
    vi.spyOn(I18nContext, 'current').mockReturnValue({
      t: (key: string) => `translated:${key}`,
    } as unknown as I18nContext);

    const error = notFoundError('storePhotoNotFound');

    expect(error).toBeInstanceOf(NotFoundException);
    expect(error.getResponse()).toEqual({
      code: 'storePhotoNotFound',
      error: 'Not Found',
      message: 'translated:common.storePhotos.storePhotoNotFound',
    });
  });

  it('沒有請求語系時以代碼當訊息', () => {
    vi.spyOn(I18nContext, 'current').mockReturnValue(undefined);

    expect(notFoundError('storePhotoNotFound').getResponse()).toMatchObject({
      code: 'storePhotoNotFound',
      message: 'storePhotoNotFound',
    });
  });
});

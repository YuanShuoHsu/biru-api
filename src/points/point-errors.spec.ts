import { readFileSync } from 'node:fs';

import { ForbiddenException } from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';

import { languagesEnum } from '../db/schema/enums.js';

import { forbiddenError, pointErrorCodes } from './point-errors.js';

const messagesOf = (language: string): Record<string, unknown> =>
  (
    JSON.parse(readFileSync(`src/i18n/${language}/common.json`, 'utf8')) as {
      points: Record<string, unknown>;
    }
  ).points;

describe('pointErrorCodes', () => {
  it.each(languagesEnum.enumValues)('每個代碼在 %s 都有翻譯', (language) => {
    const messages = messagesOf(language);

    for (const code of pointErrorCodes)
      expect(messages[code], code).toEqual(expect.stringMatching(/\S/));
  });
});

describe('forbiddenError', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('回應帶代碼與目前語系帶參數的訊息', () => {
    const t = vi.fn((key: string) => `translated:${key}`);
    vi.spyOn(I18nContext, 'current').mockReturnValue({
      t,
    } as unknown as I18nContext);

    const error = forbiddenError('adjustOwnerOnly', { maxPoints: 100 });

    expect(error).toBeInstanceOf(ForbiddenException);
    expect(error.getResponse()).toEqual({
      code: 'adjustOwnerOnly',
      error: 'Forbidden',
      message: 'translated:common.points.adjustOwnerOnly',
    });
    expect(t).toHaveBeenCalledWith('common.points.adjustOwnerOnly', {
      args: { maxPoints: 100 },
    });
  });

  it('沒有請求語系時以代碼當訊息', () => {
    vi.spyOn(I18nContext, 'current').mockReturnValue(undefined);

    expect(forbiddenError('adjustOwnerOnly').getResponse()).toMatchObject({
      code: 'adjustOwnerOnly',
      message: 'adjustOwnerOnly',
    });
  });
});

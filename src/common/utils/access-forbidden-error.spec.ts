import { ForbiddenException } from '@nestjs/common';

import { I18nContext } from 'nestjs-i18n';

import { accessForbiddenError } from './access-forbidden-error.js';

describe('accessForbiddenError', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('回 403 並帶代碼與翻譯後的訊息', () => {
    vi.spyOn(I18nContext, 'current').mockReturnValue({
      t: (key: string) => `translated:${key}`,
    } as unknown as I18nContext);

    const error = accessForbiddenError();

    expect(error).toBeInstanceOf(ForbiddenException);
    expect(error.getResponse()).toEqual({
      error: 'Forbidden',
      code: 'forbidden',
      message: 'translated:common.exceptions.forbidden',
    });
  });

  it('沒有 i18n context 時仍帶代碼', () => {
    vi.spyOn(I18nContext, 'current').mockReturnValue(undefined);

    expect(accessForbiddenError().getResponse()).toMatchObject({
      code: 'forbidden',
    });
  });
});

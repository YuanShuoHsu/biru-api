import { readFileSync } from 'node:fs';

import { NotFoundException } from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';

import { languagesEnum } from '../db/schema/enums.js';

import { notFoundError, waitlistErrorCodes } from './waitlist-errors.js';

const waitlistMessagesOf = (language: string) =>
  (
    JSON.parse(readFileSync(`src/i18n/${language}/common.json`, 'utf8')) as {
      waitlist: Record<'guest' | 'staff', Record<string, unknown>>;
    }
  ).waitlist;

describe('waitlistErrorCodes', () => {
  it.each(languagesEnum.enumValues)(
    '每個代碼在 %s 的顧客與店員版本都有翻譯',
    (language) => {
      const { guest, staff } = waitlistMessagesOf(language);

      for (const code of waitlistErrorCodes) {
        expect(guest[code], code).toEqual(expect.stringMatching(/\S/));
        expect(staff[code], code).toEqual(expect.stringMatching(/\S/));
      }
    },
  );
});

describe('notFoundError', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('回應帶代碼與對象的訊息', () => {
    vi.spyOn(I18nContext, 'current').mockReturnValue({
      t: (key: string) => `translated:${key}`,
    } as unknown as I18nContext);

    const error = notFoundError('waitlistTicketNotFound', 'staff');

    expect(error).toBeInstanceOf(NotFoundException);
    expect(error.getResponse()).toEqual({
      code: 'waitlistTicketNotFound',
      error: 'Not Found',
      message: 'translated:common.waitlist.staff.waitlistTicketNotFound',
    });
  });
});

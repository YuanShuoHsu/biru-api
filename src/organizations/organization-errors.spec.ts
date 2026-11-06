import { readFileSync } from 'node:fs';

import { ConflictException } from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';

import { languagesEnum } from '../db/schema/enums.js';

import {
  conflictError,
  organizationErrorCodes,
} from './organization-errors.js';

const messagesOf = (language: string): Record<string, unknown> =>
  (
    JSON.parse(readFileSync(`src/i18n/${language}/common.json`, 'utf8')) as {
      organizations: Record<string, unknown>;
    }
  ).organizations;

describe('organizationErrorCodes', () => {
  it.each(languagesEnum.enumValues)('每個代碼在 %s 都有翻譯', (language) => {
    const messages = messagesOf(language);

    for (const code of organizationErrorCodes)
      expect(messages[code], code).toEqual(expect.stringMatching(/\S/));
  });
});

describe('conflictError', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('回應帶代碼、帶參數翻譯的訊息與額外欄位', () => {
    const t = vi.fn((key: string) => `translated:${key}`);
    vi.spyOn(I18nContext, 'current').mockReturnValue({
      t,
    } as unknown as I18nContext);
    const conflict = { validFrom: '2026-11-10', validThrough: '2026-11-12' };

    const error = conflictError('specialHoursOverlap', conflict, { conflict });

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toEqual({
      code: 'specialHoursOverlap',
      conflict,
      error: 'Conflict',
      message: 'translated:common.organizations.specialHoursOverlap',
    });
    expect(t).toHaveBeenCalledWith('common.organizations.specialHoursOverlap', {
      args: conflict,
    });
  });

  it('沒有請求語系時以代碼當訊息', () => {
    vi.spyOn(I18nContext, 'current').mockReturnValue(undefined);

    expect(
      conflictError('notJoinedAsPlatformAdmin').getResponse(),
    ).toMatchObject({
      code: 'notJoinedAsPlatformAdmin',
      message: 'notJoinedAsPlatformAdmin',
    });
  });
});

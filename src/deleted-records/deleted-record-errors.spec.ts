import { readdirSync, readFileSync } from 'node:fs';

import { ConflictException, NotFoundException } from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';

import { languagesEnum } from '../db/schema/enums.js';

import {
  conflictError,
  deletedRecordErrorCodes,
  notFoundError,
} from './deleted-record-errors.js';

describe('deletedRecordErrorCodes', () => {
  it.each(languagesEnum.enumValues)('每個代碼在 %s 都有翻譯', (language) => {
    const messages = (
      JSON.parse(readFileSync(`src/i18n/${language}/common.json`, 'utf8')) as {
        deletedRecords: Record<string, unknown>;
      }
    ).deletedRecords;

    for (const code of deletedRecordErrorCodes)
      expect(messages[code], code).toEqual(expect.stringMatching(/\S/));
  });
});

describe('翻譯過的錯誤都帶代碼', () => {
  it('src/deleted-records 不再直接以翻譯訊息建立例外', () => {
    const offenders = readdirSync('src/deleted-records')
      .filter((file) => file.endsWith('.ts') && !file.endsWith('.spec.ts'))
      .filter((file) =>
        /Exception\(\s*this\.(i18n\.)?t\(/.test(
          readFileSync(`src/deleted-records/${file}`, 'utf8'),
        ),
      );

    expect(offenders).toEqual([]);
  });
});

describe('deleted record error helpers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('回應帶代碼與目前語系的訊息', () => {
    vi.spyOn(I18nContext, 'current').mockReturnValue({
      t: (key: string) => `translated:${key}`,
    } as unknown as I18nContext);

    const notFound = notFoundError('batchNotFound');
    const conflict = conflictError('restoreMissingReference');

    expect(notFound).toBeInstanceOf(NotFoundException);
    expect(notFound.getResponse()).toEqual({
      code: 'batchNotFound',
      error: 'Not Found',
      message: 'translated:common.deletedRecords.batchNotFound',
    });
    expect(conflict).toBeInstanceOf(ConflictException);
    expect(conflict.getResponse()).toEqual({
      code: 'restoreMissingReference',
      error: 'Conflict',
      message: 'translated:common.deletedRecords.restoreMissingReference',
    });
  });

  it('沒有請求語系時以代碼當訊息', () => {
    vi.spyOn(I18nContext, 'current').mockReturnValue(undefined);

    expect(conflictError('restoreConflict').getResponse()).toMatchObject({
      code: 'restoreConflict',
      message: 'restoreConflict',
    });
  });
});

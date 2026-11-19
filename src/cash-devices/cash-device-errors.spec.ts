import { readFileSync } from 'node:fs';

import { ConflictException, NotFoundException } from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';

import { languagesEnum } from '../db/schema/enums.js';

import {
  cashDeviceErrorCodes,
  conflictError,
  notFoundError,
} from './cash-device-errors.js';

const cashDeviceMessagesOf = (language: string): Record<string, unknown> =>
  (
    JSON.parse(readFileSync(`src/i18n/${language}/common.json`, 'utf8')) as {
      cashDevices: Record<string, unknown>;
    }
  ).cashDevices;

describe('cashDeviceErrorCodes', () => {
  it.each(languagesEnum.enumValues)('每個代碼在 %s 都有翻譯', (language) => {
    const messages = cashDeviceMessagesOf(language);

    for (const code of cashDeviceErrorCodes)
      expect(messages[code], code).toEqual(expect.stringMatching(/\S/));
  });
});

describe('cash device errors', () => {
  beforeEach(() => {
    vi.spyOn(I18nContext, 'current').mockReturnValue({
      t: (key: string) => `translated:${key}`,
    } as unknown as I18nContext);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['cashDeviceNotFound', notFoundError, NotFoundException, 'Not Found'],
    ['cashDeviceInUse', conflictError, ConflictException, 'Conflict'],
  ] as const)(
    '%s 回應帶代碼與目前語系的訊息',
    (code, build, exception, error) => {
      const thrown = build(code);

      expect(thrown).toBeInstanceOf(exception);
      expect(thrown.getResponse()).toEqual({
        code,
        error,
        message: `translated:common.cashDevices.${code}`,
      });
    },
  );
});

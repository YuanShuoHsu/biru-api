import type { ArgumentsHost } from '@nestjs/common';
import { ConflictException, ForbiddenException } from '@nestjs/common';

import type { MockInstance } from 'vitest';
import { I18nContext } from 'nestjs-i18n';

import {
  organizationClosedError,
  organizationHasOpenWorkError,
  organizationReadOnlyError,
} from './organization-closure.js';

describe('門市停業的錯誤', () => {
  const t = vi.fn(
    (key: string, options?: { args?: Record<string, unknown> }) =>
      `translated:${key}${options?.args ? JSON.stringify(options.args) : ''}`,
  );

  let current: MockInstance<typeof I18nContext.current>;

  beforeEach(() => {
    current = vi.spyOn(I18nContext, 'current').mockReturnValue({
      t,
    } as unknown as I18nContext);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('organizationClosedError 回 409 並帶代碼', () => {
    const error = organizationClosedError();

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toEqual({
      error: 'Conflict',
      code: 'organizationClosed',
      message: 'translated:common.exceptions.organizationClosed',
    });
  });

  it('organizationReadOnlyError 回 403 並帶代碼', () => {
    const host = {} as ArgumentsHost;
    const error = organizationReadOnlyError(host);

    expect(current).toHaveBeenCalledWith(host);
    expect(error).toBeInstanceOf(ForbiddenException);
    expect(error.getResponse()).toEqual({
      error: 'Forbidden',
      code: 'organizationReadOnly',
      message: 'translated:common.exceptions.organizationReadOnly',
    });
  });

  it('organizationHasOpenWorkError 回 409、帶代碼並代入未完成的數量', () => {
    const error = organizationHasOpenWorkError(2, 3);

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toEqual({
      error: 'Conflict',
      code: 'organizationHasOpenWork',
      message:
        'translated:common.exceptions.organizationHasOpenWork{"orders":2,"tickets":3}',
    });
  });

  it('沒有請求語系時仍帶代碼', () => {
    current.mockReturnValue(undefined);

    expect(organizationClosedError().getResponse()).toMatchObject({
      code: 'organizationClosed',
      message: 'This store is closed.',
    });
  });
});

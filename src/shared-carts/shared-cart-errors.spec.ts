import { readFileSync } from 'node:fs';

import { I18nContext } from 'nestjs-i18n';

import { languagesEnum } from '../db/schema/enums.js';
import { SHARED_CART_ANIMAL_AVATARS } from '../db/schema/shared-carts.js';

import {
  modeMismatchError,
  sharedCartErrorCodes,
} from './shared-cart-errors.js';

const sharedCartMessagesOf = (language: string) =>
  (
    JSON.parse(readFileSync(`src/i18n/${language}/common.json`, 'utf8')) as {
      sharedCarts: Record<string, unknown> & {
        avatars: Record<string, unknown>;
      };
    }
  ).sharedCarts;

describe('shared cart translations', () => {
  it.each(languagesEnum.enumValues)(
    'every error code, animal and the anonymous nickname have %s copy',
    (language) => {
      const messages = sharedCartMessagesOf(language);

      for (const code of sharedCartErrorCodes)
        expect(messages[code], code).toEqual(expect.stringMatching(/\S/));
      for (const animal of SHARED_CART_ANIMAL_AVATARS)
        expect(messages.avatars[animal], animal).toEqual(
          expect.stringMatching(/\S/),
        );
      expect(messages.anonymousNickname).toContain('{animal}');
    },
  );
});

describe('modeMismatchError', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('names the cart’s mode in the message and in the body', () => {
    vi.spyOn(I18nContext, 'current').mockReturnValue({
      t: (key: string, options?: { args?: { mode?: string } }) =>
        key === 'common.orderTickets.modes.dineIn'
          ? '內用'
          : `${key}:${options?.args?.mode}`,
    } as unknown as I18nContext);

    expect(modeMismatchError('dineIn').getResponse()).toEqual({
      code: 'sharedCartModeMismatch',
      error: 'Conflict',
      message: 'common.sharedCarts.sharedCartModeMismatch:內用',
      mode: 'dineIn',
    });
  });
});

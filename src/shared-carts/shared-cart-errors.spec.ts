import { readFileSync } from 'node:fs';

import { languagesEnum } from '../db/schema/enums.js';
import { SHARED_CART_ANIMAL_AVATARS } from '../db/schema/shared-carts.js';

import { sharedCartErrorCodes } from './shared-cart-errors.js';

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

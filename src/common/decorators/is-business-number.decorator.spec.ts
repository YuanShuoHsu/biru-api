import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { IsBusinessNumber } from './is-business-number.decorator.js';

class Target {
  @IsBusinessNumber()
  businessNumber: unknown;
}

const errorsOf = async (businessNumber: unknown) =>
  (await validate(plainToInstance(Target, { businessNumber }))).map(
    ({ constraints, property }) => ({ constraints, property }),
  );

describe('IsBusinessNumber', () => {
  it.each(['22099131', '04595257'])('接受 %j', async (businessNumber) => {
    expect(await errorsOf(businessNumber)).toEqual([]);
  });

  it.each(['12345678', '1234567', '', 12345675, undefined])(
    '拒絕 %j',
    async (businessNumber) => {
      expect(await errorsOf(businessNumber)).toEqual([
        {
          constraints: {
            isBusinessNumber: expect.stringMatching(
              /^validation\.businessNumber\|/,
            ),
          },
          property: 'businessNumber',
        },
      ]);
    },
  );
});

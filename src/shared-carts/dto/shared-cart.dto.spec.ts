import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import {
  CreateSharedCartDto,
  JoinSharedCartDto,
  SharedCartProfileDto,
} from './shared-cart.dto.js';

const pipeOptions = { forbidNonWhitelisted: true, whitelist: true };

const errorsOf = async (dto: new () => object, body: object) => {
  const instance = plainToInstance(dto, body);
  return {
    errors: (await validate(instance, pipeOptions)).map(
      ({ property }) => property,
    ),
    instance,
  };
};

describe('SharedCartProfileDto', () => {
  it('accepts an empty body', async () => {
    expect((await errorsOf(SharedCartProfileDto, {})).errors).toEqual([]);
  });

  it('trims the nickname', async () => {
    const { errors, instance } = await errorsOf(SharedCartProfileDto, {
      nickname: ' 小明 ',
    });
    expect(errors).toEqual([]);
    expect(instance).toEqual({ nickname: '小明' });
  });

  it.each([
    ['blank', '   '],
    ['null', null],
    ['a number', 1],
    ['21 characters', 'あ'.repeat(21)],
    ['multi-line', '小明\n小華'],
    ['zero-width', '小\u200b明'],
    ['right-to-left override', '小\u202e明'],
  ])('rejects a %s nickname', async (_, nickname) => {
    expect((await errorsOf(SharedCartProfileDto, { nickname })).errors).toEqual(
      ['nickname'],
    );
  });

  it.each([
    'あ'.repeat(20),
    '😀'.repeat(20),
    '👨\u200d👩\u200d👧',
    'می\u200cخواهم',
  ])('accepts the 20 character nickname %s', async (nickname) => {
    expect((await errorsOf(SharedCartProfileDto, { nickname })).errors).toEqual(
      [],
    );
  });

  it.each(['cat', 'koala', 'member'])(
    'accepts the %s avatar',
    async (avatar) => {
      expect((await errorsOf(SharedCartProfileDto, { avatar })).errors).toEqual(
        [],
      );
    },
  );

  it.each(['lion', null])('rejects the %s avatar', async (avatar) => {
    expect((await errorsOf(SharedCartProfileDto, { avatar })).errors).toEqual([
      'avatar',
    ]);
  });
});

describe('CreateSharedCartDto', () => {
  it('requires an order mode', async () => {
    expect((await errorsOf(CreateSharedCartDto, {})).errors).toEqual(['mode']);
    expect(
      (await errorsOf(CreateSharedCartDto, { mode: 'pickup' })).errors,
    ).toEqual([]);
  });
});

describe('JoinSharedCartDto', () => {
  it.each([
    ['012345', []],
    ['12345', ['code']],
    ['1234567', ['code']],
    ['12a456', ['code']],
    [123456, ['code']],
  ])('code %j', async (code, errors) => {
    expect((await errorsOf(JoinSharedCartDto, { code })).errors).toEqual(
      errors,
    );
  });
});

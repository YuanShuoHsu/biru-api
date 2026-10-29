import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { UpdateUserDto } from './update-user.dto.js';

const invalidProperties = async (body: Record<string, unknown>) =>
  (await validate(plainToInstance(UpdateUserDto, body))).map(
    ({ property }) => property,
  );

describe('UpdateUserDto', () => {
  it('accepts a partial update', async () => {
    expect(await invalidProperties({ firstName: 'Coffee' })).toEqual([]);
  });

  it('accepts a full update', async () => {
    expect(
      await invalidProperties({
        birthDate: '2024-04-04',
        emailSubscribed: true,
        firstName: 'Coffee',
        gender: 'male',
        image: 'https://example.com/avatar.png',
        lastName: 'Biru',
        phoneNumber: '+886912345678',
      }),
    ).toEqual([]);
  });

  it.each([{ lastName: '' }, { phoneNumber: '' }])(
    'accepts clearing an optional sign-up field %j',
    async (body) => {
      expect(await invalidProperties(body)).toEqual([]);
    },
  );

  it.each([
    [{ firstName: 123 }, 'firstName'],
    [{ firstName: '' }, 'firstName'],
    [{ firstName: '  ' }, 'firstName'],
    [{ firstName: null }, 'firstName'],
    [{ emailSubscribed: null }, 'emailSubscribed'],
    [{ lastName: 123 }, 'lastName'],
    [{ phoneNumber: 886912345678 }, 'phoneNumber'],
  ])('rejects %j', async (body, property) => {
    expect(await invalidProperties(body)).toEqual([property]);
  });
});
